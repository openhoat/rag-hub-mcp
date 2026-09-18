import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createSqliteJobQueue } from './sqlite-job-queue.js'

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
    await queue.enqueue([{ kb: 'kb1', relPath: 'a.md', op: 'index', sha256: 'abc', mtime: 1, bytes: 100 }])
    await queue.claim(1)
    const reclaimed = await queue.reclaimStale(0)
    expect(reclaimed).toBe(0)
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
