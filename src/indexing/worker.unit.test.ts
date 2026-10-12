import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { env } from '../shared/config.js'
import type { IndexJob, JobQueue, Store, Worker } from '../shared/types.js'

vi.mock('./ingest.js', () => ({ indexFile: vi.fn(async () => true) }))

import { indexFile } from './ingest.js'
import { createWorker } from './worker.js'

// KB_ROOT is a stable temp dir set by vitest.setup.ts before any module loads.
const kbRoot = process.env.KB_ROOT as string

const makeJob = (over: Partial<IndexJob> = {}): IndexJob => ({
  id: 1,
  kb: 'docs',
  relPath: 'a.md',
  op: 'index',
  sha256: 'abc',
  mtime: 0,
  bytes: 1,
  attempts: 0,
  status: 'processing',
  lastError: null,
  ...over,
})

const makeQueue = (jobs: IndexJob[]): JobQueue & { completed: number[]; failed: { id: number; reason: string }[] } => {
  const completed: number[] = []
  const failed: { id: number; reason: string }[] = []
  return {
    enqueue: vi.fn(async () => {}),
    claim: vi.fn(async (limit: number) => jobs.splice(0, limit)),
    complete: vi.fn(async (id: number) => {
      completed.push(id)
    }),
    fail: vi.fn(async (id: number, reason: string) => {
      failed.push({ id, reason })
    }),
    reclaimStale: vi.fn(async () => 0),
    stats: vi.fn(async () => ({ pending: 0, processing: 0, failed: 0 })),
    failedList: vi.fn(async () => []),
    processingList: vi.fn(async () => []),
    progress: vi.fn(async () => {}),
    retryJob: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    clearForKb: vi.fn(async () => {}),
    clearForFile: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    completed,
    failed,
  }
}

let worker: Worker | null = null

const start = (jobs: IndexJob[], kbId: number | undefined = 1) => {
  const queue = makeQueue(jobs)
  const store = { getKbId: vi.fn(async () => kbId) } as unknown as Store
  worker = createWorker(store, queue)
  worker.start()
  return { queue, store }
}

beforeAll(() => {
  mkdirSync(join(kbRoot, 'docs'), { recursive: true })
  writeFileSync(join(kbRoot, 'docs', 'a.md'), 'x', 'utf-8')
})

afterEach(async () => {
  if (worker) await worker.stop()
  worker = null
  vi.clearAllMocks()
})

describe('worker path hardening', () => {
  test('should index a valid job through the sanitized path', async () => {
    const { queue } = start([makeJob()])
    await vi.waitFor(() => expect(queue.completed).toContain(1))
    expect(indexFile).toHaveBeenCalledTimes(1)
    expect(queue.failed).toHaveLength(0)
  })

  test('should fail a job whose kb escapes the KB root without touching disk', async () => {
    const { queue } = start([makeJob({ kb: '../..', relPath: 'etc/passwd' })])
    await vi.waitFor(() => expect(queue.failed).toHaveLength(1))
    expect(indexFile).not.toHaveBeenCalled()
    expect(queue.completed).toHaveLength(0)
    expect(queue.failed[0].id).toBe(1)
    expect(queue.failed[0].reason).toMatch(/invalid path/)
  })

  test('should fail a job whose relPath escapes the KB root', async () => {
    const { queue } = start([makeJob({ relPath: '../../etc/passwd' })])
    await vi.waitFor(() => expect(queue.failed).toHaveLength(1))
    expect(indexFile).not.toHaveBeenCalled()
  })
})

describe('worker startup reclaim', () => {
  test('should reclaim orphaned jobs from a previous run on the first poll', async () => {
    const { queue } = start([makeJob()])
    await vi.waitFor(() => expect(queue.reclaimStale).toHaveBeenCalledWith(0))
  })
})

describe('worker concurrency', () => {
  test('should never claim more jobs than the in-flight cap allows', async () => {
    vi.useFakeTimers()
    const releases: Array<() => void> = []
    vi.mocked(indexFile).mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          releases.push(() => resolve(true))
        }),
    )
    try {
      const jobs = Array.from({ length: 10 }, (_, i) => makeJob({ id: i + 1 }))
      const { queue } = start(jobs)

      // First poll: at most CONCURRENCY (4) jobs are claimed.
      await vi.advanceTimersByTimeAsync(1)
      expect(queue.claim).toHaveBeenCalledTimes(1)
      expect(queue.claim).toHaveBeenNthCalledWith(1, 4)

      // All four slots are busy: the next poll claims nothing.
      await vi.advanceTimersByTimeAsync(1000)
      expect(queue.claim).toHaveBeenCalledTimes(1)

      // A job completes -> exactly one free slot on the following poll.
      releases.shift()?.()
      await vi.advanceTimersByTimeAsync(1000)
      expect(queue.claim).toHaveBeenCalledTimes(2)
      expect(queue.claim).toHaveBeenNthCalledWith(2, 1)

      // Release the rest so afterEach can stop the worker without hanging.
      for (const release of releases) release()
      await vi.advanceTimersByTimeAsync(1)
    } finally {
      vi.mocked(indexFile).mockImplementation(async () => true)
      vi.useRealTimers()
    }
  })
})

describe('worker job deadline', () => {
  test('should abort and fail a job that exceeds INDEXER_JOB_TIMEOUT_MS', async () => {
    vi.useFakeTimers()
    vi.mocked(indexFile).mockImplementation(
      (...args: unknown[]) =>
        new Promise<boolean>((_resolve, reject) => {
          const signal = (args[5] as { signal?: AbortSignal } | undefined)?.signal
          signal?.addEventListener('abort', () => reject(signal.reason))
        }),
    )
    try {
      const { queue } = start([makeJob()])
      await vi.advanceTimersByTimeAsync(env.INDEXER_JOB_TIMEOUT_MS + 1)
      expect(queue.failed).toHaveLength(1)
      expect(queue.failed[0].reason).toMatch(/INDEXER_JOB_TIMEOUT_MS/)
    } finally {
      vi.mocked(indexFile).mockImplementation(async () => true)
      vi.useRealTimers()
    }
  })

  test('should not start a second execution of a job that is still in flight', async () => {
    vi.useFakeTimers()
    const releases: Array<() => void> = []
    vi.mocked(indexFile).mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          releases.push(() => resolve(true))
        }),
    )
    try {
      const queue = makeQueue([])
      // A stale reclaim keeps re-claiming the same, still-running job.
      vi.mocked(queue.claim).mockImplementation(async () => [makeJob({ id: 1 })])
      const store = { getKbId: vi.fn(async () => 1) } as unknown as Store
      worker = createWorker(store, queue)
      worker.start()

      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(1000)
      expect(indexFile).toHaveBeenCalledTimes(1)

      for (const release of releases) release()
      await vi.advanceTimersByTimeAsync(1)
    } finally {
      vi.mocked(indexFile).mockImplementation(async () => true)
      vi.useRealTimers()
    }
  })
})

describe('worker progress', () => {
  test('should forward index progress to the queue', async () => {
    vi.mocked(indexFile).mockImplementation(async (...args: unknown[]) => {
      const onProgress = (args[5] as { onProgress?: (done: number, total: number) => void } | undefined)?.onProgress
      onProgress?.(1, 3)
      return true
    })
    try {
      const { queue } = start([makeJob({ id: 7 })])
      await vi.waitFor(() => expect(queue.completed).toContain(7))
      expect(queue.progress).toHaveBeenCalledWith(7, 1, 3)
    } finally {
      vi.mocked(indexFile).mockImplementation(async () => true)
    }
  })
})

const POLL_INTERVAL_MS = 1000

describe('worker edge paths', () => {
  test('should complete a job whose file no longer exists', async () => {
    const { queue } = start([makeJob({ relPath: 'gone.md' })])
    await vi.waitFor(() => expect(queue.completed).toContain(1))
    expect(indexFile).not.toHaveBeenCalled()
    expect(queue.failed).toHaveLength(0)
  })

  test('should complete a job whose knowledge base is unknown', async () => {
    const queue = makeQueue([makeJob()])
    const store = { getKbId: vi.fn(async () => undefined) } as unknown as Store
    worker = createWorker(store, queue)
    worker.start()
    await vi.waitFor(() => expect(queue.completed).toContain(1))
    expect(indexFile).not.toHaveBeenCalled()
  })

  test('should complete (not fail) a file that yields no text', async () => {
    vi.mocked(indexFile).mockResolvedValueOnce(false)
    const { queue } = start([makeJob()])
    await vi.waitFor(() => expect(queue.completed).toContain(1))
    expect(queue.failed).toHaveLength(0)
  })

  test('should park a job as failed once retries are exhausted', async () => {
    vi.mocked(indexFile).mockRejectedValueOnce(new Error('boom'))
    const { queue } = start([makeJob({ id: 5, attempts: env.INDEXER_RETRY_MAX })])
    await vi.waitFor(() => expect(queue.failed).toHaveLength(1))
    expect(queue.failed[0]).toEqual({ id: 5, reason: 'boom' })
  })

  test('should survive and log a queue error during poll', async () => {
    vi.useFakeTimers()
    try {
      const queue = makeQueue([])
      vi.mocked(queue.claim).mockRejectedValueOnce(new Error('db down'))
      const store = { getKbId: vi.fn(async () => 1) } as unknown as Store
      worker = createWorker(store, queue)
      worker.start()
      await vi.advanceTimersByTimeAsync(1)
      expect(queue.claim).toHaveBeenCalledTimes(1)
      // The loop keeps polling after the failure.
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
      expect(vi.mocked(queue.claim).mock.calls.length).toBeGreaterThanOrEqual(2)
    } finally {
      vi.useRealTimers()
    }
  })

  test('should ignore a second start call', async () => {
    const { queue } = start([makeJob()])
    await vi.waitFor(() => expect(queue.reclaimStale).toHaveBeenCalledWith(0))
    worker?.start()
    expect(vi.mocked(queue.reclaimStale).mock.calls.filter(c => c[0] === 0)).toHaveLength(1)
  })
})

describe('worker drain', () => {
  test('should return immediately when nothing is pending or in flight', async () => {
    const queue = makeQueue([])
    const store = { getKbId: vi.fn(async () => 1) } as unknown as Store
    worker = createWorker(store, queue)
    await expect(worker.drain()).resolves.toBeUndefined()
  })

  test('should wait for pending jobs when nothing is in flight', async () => {
    vi.useFakeTimers()
    try {
      const queue = makeQueue([])
      vi.mocked(queue.stats)
        .mockResolvedValueOnce({ pending: 1, processing: 0, failed: 0 })
        .mockResolvedValueOnce({ pending: 0, processing: 0, failed: 0 })
      const store = { getKbId: vi.fn(async () => 1) } as unknown as Store
      worker = createWorker(store, queue)
      const drained = worker.drain()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 1)
      await expect(drained).resolves.toBeUndefined()
      expect(queue.stats).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  test('should resolve when in-flight jobs complete', async () => {
    const releases: Array<() => void> = []
    vi.mocked(indexFile).mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          releases.push(() => resolve(true))
        }),
    )
    try {
      const { queue } = start([makeJob({ id: 1 })])
      await vi.waitFor(() => expect(indexFile).toHaveBeenCalled())
      let drained = false
      const done = worker?.drain().then(() => {
        drained = true
      })
      expect(drained).toBe(false)
      for (const release of releases) release()
      await done
      expect(drained).toBe(true)
      expect(queue.completed).toContain(1)
    } finally {
      vi.mocked(indexFile).mockImplementation(async () => true)
    }
  })
})

describe('worker complete', () => {
  test('should pass the job hash to complete so a superseded job is re-armed', async () => {
    const queue = makeQueue([])
    vi.mocked(queue.claim).mockResolvedValueOnce([makeJob({ id: 3, sha256: 'h3' })])
    const store = { getKbId: vi.fn(async () => 1) } as unknown as Store
    worker = createWorker(store, queue)
    worker.start()
    await vi.waitFor(() => expect(queue.completed).toContain(3))
    expect(queue.complete).toHaveBeenCalledWith(3, 'h3')
  })

  test('should complete without a hash when the file is gone', async () => {
    const { queue } = start([makeJob({ id: 9, relPath: 'gone.md' })])
    await vi.waitFor(() => expect(queue.completed).toContain(9))
    expect(queue.complete).toHaveBeenCalledWith(9)
  })
})
