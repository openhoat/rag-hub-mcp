import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
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
