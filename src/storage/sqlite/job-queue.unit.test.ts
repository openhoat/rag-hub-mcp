import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { env } from '../../shared/config.js'
import { createSqliteJobQueue } from './job-queue.js'

let dbPath: string
let queue: ReturnType<typeof createSqliteJobQueue>

const dbCleanup = (): void => {
  if (dbPath) {
    try {
      rmSync(dbPath, { force: true })
      rmSync(`${dbPath}-wal`, { force: true })
      rmSync(`${dbPath}-shm`, { force: true })
    } catch {
      /* ignore */
    }
  }
}

describe('SqliteJobQueue', () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'rag-jqueue-'))
    dbPath = join(dir, 'queue.db')
    queue = createSqliteJobQueue(dbPath)
  })

  afterEach(async () => {
    await queue.close()
    dbCleanup()
  })

  test('enqueue and stats reflect single pending job', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    const s = await queue.stats()
    expect(s.pending).toBe(1)
    expect(s.processing).toBe(0)
    expect(s.failed).toBe(0)
  })

  test('claim atomically marks jobs as processing', async () => {
    await queue.enqueue([
      { kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 },
      { kb: 'kb2', relPath: 'b.md', op: 'index', sha256: 'def', mtime: 2, bytes: 200 },
    ])
    const claimed = await queue.claim(10)
    expect(claimed).toHaveLength(2)
    expect(claimed[0].status).toBe('processing')
    const s = await queue.stats()
    expect(s.pending).toBe(0)
    expect(s.processing).toBe(2)
  })

  test('complete removes the job', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    const [job] = await queue.claim(1)
    await queue.complete(job.id)
    const s = await queue.stats()
    expect(s.pending).toBe(0)
    expect(s.processing).toBe(0)
  })

  test('fail and retry', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    const [job] = await queue.claim(1)
    await queue.fail(job.id, 'timeout')
    // After first failure, attempts=1, status should be 'pending' (retry < INDEXER_RETRY_MAX)
    const s = await queue.stats()
    expect(s.pending).toBe(1)
    expect(s.failed).toBe(0)
  })

  test('fail parks when retries exhausted', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    const [job] = await queue.claim(1)
    // Default RETRY_MAX=3, so fail 3 times should park it
    await queue.fail(job.id, 'err1')
    await queue.fail(job.id, 'err2')
    await queue.fail(job.id, 'err3')
    const s = await queue.stats()
    expect(s.failed).toBe(1)
    expect(s.pending).toBe(0)
  })

  test('retryJob resets a failed job', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    const [job] = await queue.claim(1)
    await queue.fail(job.id, 'err')
    await queue.fail(job.id, 'err')
    await queue.fail(job.id, 'err')
    let s = await queue.stats()
    expect(s.failed).toBe(1)

    const failed = await queue.failedList()
    await queue.retryJob(failed[0].id)
    s = await queue.stats()
    expect(s.pending).toBe(1)
    expect(s.failed).toBe(0)
  })

  test('reclaimStale resets processing jobs', async () => {
    vi.useFakeTimers()
    try {
      const base = 1_700_000_000_000
      vi.setSystemTime(base)
      await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
      await queue.claim(1)
      // Same timestamp is not stale (started_at < cutoff → strict <)
      expect(await queue.reclaimStale(0)).toBe(0)
      // 60s later, 30s threshold: job is stale → reclaimed back to pending
      vi.setSystemTime(base + 60_000)
      expect(await queue.reclaimStale(30)).toBe(1)
      const s = await queue.stats()
      expect(s.pending).toBe(1)
      expect(s.processing).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  test('fail schedules a backoff before the job can be re-claimed', async () => {
    vi.useFakeTimers()
    try {
      const base = 1_700_000_000_000
      vi.setSystemTime(base)
      await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
      const [job] = await queue.claim(1)
      await queue.fail(job.id, 'boom')
      // Not claimable yet: retry_at is in the future.
      expect(await queue.claim(1)).toHaveLength(0)
      // After the base backoff elapses, the job becomes claimable again.
      vi.setSystemTime(base + env.INDEXER_RETRY_BASE_MS + 1)
      const reclaimed = await queue.claim(1)
      expect(reclaimed).toHaveLength(1)
      expect(reclaimed[0].id).toBe(job.id)
    } finally {
      vi.useRealTimers()
    }
  })

  test('reclaimStale counts as an attempt and parks a job that never completes', async () => {
    vi.useFakeTimers()
    try {
      const base = 1_700_000_000_000
      vi.setSystemTime(base)
      await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
      await queue.claim(1)
      for (let i = 1; i <= 3; i++) {
        vi.setSystemTime(base + i * 60_000)
        expect(await queue.reclaimStale(30)).toBe(1)
        if (i < 3) await queue.claim(1)
      }
      const s = await queue.stats()
      expect(s.failed).toBe(1)
      expect(s.processing).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  test('processingList returns the in-flight jobs', async () => {
    await queue.enqueue([
      { kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 },
      { kb: 'kb2', relPath: 'b.md', op: 'index', sha256: 'def', mtime: 2, bytes: 200 },
    ])
    await queue.claim(2)
    const processing = await queue.processingList()
    expect(processing).toHaveLength(2)
    expect(processing.every(j => j.status === 'processing')).toBe(true)
  })

  test('progress is recorded and cleared on a fresh claim', async () => {
    vi.useFakeTimers()
    try {
      const base = 1_700_000_000_000
      vi.setSystemTime(base)
      await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
      const [job] = await queue.claim(1)
      await queue.progress(job.id, 3, 10)
      const [running] = await queue.processingList()
      expect(running.progressDone).toBe(3)
      expect(running.progressTotal).toBe(10)

      await queue.fail(job.id, 'boom')
      vi.setSystemTime(base + env.INDEXER_RETRY_BASE_MS + 1)
      const [reclaimed] = await queue.claim(1)
      expect(reclaimed.progressDone).toBeNull()
      expect(reclaimed.progressTotal).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test('enqueue idempotency: re-enqueue resets failed', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    const [job] = await queue.claim(1)
    await queue.fail(job.id, 'err1')
    await queue.fail(job.id, 'err2')
    await queue.fail(job.id, 'err3')
    const s1 = await queue.stats()
    expect(s1.failed).toBe(1)

    // Re-enqueue the same file — should reset failed to pending
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    const s2 = await queue.stats()
    expect(s2.pending).toBe(1)
    expect(s2.failed).toBe(0)
  })

  test('complete deletes a job whose hash is unchanged', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'same', mtime: 1, bytes: 100 }])
    const [job] = await queue.claim(1)
    await queue.complete(job.id, 'same')
    expect(await queue.stats()).toEqual({ pending: 0, processing: 0, failed: 0 })
  })

  test('complete re-arms a job superseded by a newer enqueue', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'old', mtime: 1, bytes: 100 }])
    const [job] = await queue.claim(1)
    // A concurrent scan re-enqueues the same file with a newer hash while the job runs.
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'new', mtime: 2, bytes: 120 }])
    await queue.complete(job.id, 'old')

    expect((await queue.stats()).pending).toBe(1)
    const [again] = await queue.claim(1)
    expect(again.sha256).toBe('new')
  })

  test('clear removes all jobs', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    await queue.clear()
    const s = await queue.stats()
    expect(s.pending).toBe(0)
  })

  test('clearForKb removes jobs for that kb', async () => {
    await queue.enqueue([
      { kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 },
      { kb: 'kb2', relPath: 'b.md', op: 'index', sha256: 'def', mtime: 2, bytes: 200 },
    ])
    await queue.clearForKb('kb1')
    const s = await queue.stats()
    expect(s.pending).toBe(1)
  })

  test('clearForFile removes a specific job', async () => {
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    await queue.clearForFile('kb1', 'a.md')
    const s = await queue.stats()
    expect(s.pending).toBe(0)
  })
})
