import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { JobQueue, NewJob } from '../../shared/types'
import { createPgliteJobQueue } from '../helpers'

/**
 * E2E for the PostgreSQL job queue against an in-memory PGlite instance. Covers
 * the retry backoff schedule, the retry-exhaustion park and the stale reclaim
 * semantics that keep a job from looping forever.
 */
let queue: JobQueue

const newJob = (over: Partial<NewJob> = {}): NewJob => ({
  kb: 'kb1',
  relPath: 'a.md',
  op: 'index',
  sha256: 'abc',
  mtime: 1,
  bytes: 100,
  ...over,
})

beforeAll(async () => {
  queue = await createPgliteJobQueue()
})

afterAll(async () => {
  await queue.close()
})

describe('pgJobQueue (e2e, in-memory PGlite)', () => {
  test('should enqueue, claim and complete a job', async () => {
    await queue.enqueue([newJob()])
    const claimed = await queue.claim(10)
    expect(claimed).toHaveLength(1)
    expect(claimed[0].status).toBe('processing')
    await queue.complete(claimed[0].id)
    const s = await queue.stats()
    expect(s.pending).toBe(0)
    expect(s.processing).toBe(0)
  })

  test('should schedule a backoff that blocks an immediate re-claim', async () => {
    await queue.enqueue([newJob({ relPath: 'backoff.md' })])
    const [job] = await queue.claim(1)
    await queue.fail(job.id, 'boom')
    expect(await queue.claim(1)).toHaveLength(0)
  })

  test('should park a job once retries are exhausted', async () => {
    await queue.enqueue([newJob({ relPath: 'park.md' })])
    const [job] = await queue.claim(1)
    await queue.fail(job.id, 'e1')
    await queue.fail(job.id, 'e2')
    await queue.fail(job.id, 'e3')
    const s = await queue.stats()
    expect(s.failed).toBe(1)
  })

  test('should expose processing jobs and reclaim stale ones', async () => {
    await queue.enqueue([newJob({ relPath: 'stale.md' })])
    const [job] = await queue.claim(1)
    expect((await queue.processingList()).map(j => j.id)).toContain(job.id)
    expect(await queue.reclaimStale(0)).toBeGreaterThanOrEqual(1)
    expect((await queue.stats()).processing).toBe(0)
  })

  test('should expose indexing progress of a running job', async () => {
    await queue.enqueue([newJob({ relPath: 'progress.md' })])
    const [job] = await queue.claim(1)
    await queue.progress(job.id, 2, 7)
    const [running] = await queue.processingList()
    expect(running.progressDone).toBe(2)
    expect(running.progressTotal).toBe(7)
  })

  test('should re-arm a job superseded by a newer enqueue on complete', async () => {
    const q = await createPgliteJobQueue()
    try {
      await q.enqueue([newJob({ relPath: 'superseded.md', sha256: 'old' })])
      const [job] = await q.claim(1)
      // A concurrent scan re-enqueues the same file with a newer hash while it runs.
      await q.enqueue([newJob({ relPath: 'superseded.md', sha256: 'new', mtime: 2, bytes: 120 })])
      await q.complete(job.id, 'old')

      expect((await q.stats()).pending).toBe(1)
      const [again] = await q.claim(1)
      expect(again.sha256).toBe('new')
    } finally {
      await q.close()
    }
  })
})
