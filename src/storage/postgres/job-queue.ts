import { Pool } from 'pg'
import { retryBackoffMs } from '../../shared/backoff.js'
import { env } from '../../shared/config.js'
import type { IndexJob, JobQueue, JobStats, NewJob } from '../../shared/types.js'
import type { Db } from './db.js'
import { buildPoolConfig, poolToDb } from './db.js'

const RETRY_MAX = env.INDEXER_RETRY_MAX
const RETRY_BASE_MS = env.INDEXER_RETRY_BASE_MS
const RETRY_MAX_MS = env.INDEXER_RETRY_MAX_MS

const migrateSql = `
  CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    kb TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    op TEXT NOT NULL DEFAULT 'index',
    sha256 TEXT NOT NULL,
    mtime BIGINT NOT NULL,
    bytes BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    started_at TIMESTAMPTZ,
    retry_at TIMESTAMPTZ,
    progress_done INTEGER,
    progress_total INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(kb, rel_path, op)
  );
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_at TIMESTAMPTZ;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress_done INTEGER;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress_total INTEGER;
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
`

const rowToJob = (r: Record<string, unknown>): IndexJob => ({
  id: r.id as number,
  kb: r.kb as string,
  relPath: r.rel_path as string,
  op: r.op as IndexJob['op'],
  sha256: r.sha256 as string,
  mtime: Number(r.mtime),
  bytes: Number(r.bytes),
  status: r.status as IndexJob['status'],
  attempts: r.attempts as number,
  lastError: (r.last_error as string) ?? null,
  startedAt: r.started_at ? new Date(r.started_at as string).getTime() : null,
  retryAt: r.retry_at ? new Date(r.retry_at as string).getTime() : null,
  progressDone: r.progress_done == null ? null : Number(r.progress_done),
  progressTotal: r.progress_total == null ? null : Number(r.progress_total),
})

// Removes a finished job, but only when it still carries the hash that was
// indexed: a concurrent scan may have re-enqueued a newer version while the job
// ran (stored sha256 changed), in which case the job is re-armed as 'pending'
// instead of dropping the newer work (scan/worker lost update, KANBAN #19).
const completeJob = async (db: Db, id: number, sha256?: string): Promise<void> => {
  if (sha256 === undefined) {
    await db.query('DELETE FROM jobs WHERE id = $1', [id])
    return
  }
  const res = await db.query<{ id: number }>('DELETE FROM jobs WHERE id = $1 AND sha256 = $2 RETURNING id', [id, sha256])
  if (res.rows.length === 0) {
    await db.query(
      "UPDATE jobs SET status = 'pending', started_at = NULL, progress_done = NULL, progress_total = NULL, retry_at = NULL WHERE id = $1",
      [id],
    )
  }
}

const failedList0 = async (db: Db, limit = 20): Promise<IndexJob[]> => {
  const res = await db.query<Record<string, unknown>>('SELECT * FROM jobs WHERE status = $1 ORDER BY id DESC LIMIT $2', ['failed', limit])
  return res.rows.map(rowToJob)
}

const processingList0 = async (db: Db, limit = 50): Promise<IndexJob[]> => {
  const res = await db.query<Record<string, unknown>>('SELECT * FROM jobs WHERE status = $1 ORDER BY started_at LIMIT $2', [
    'processing',
    limit,
  ])
  return res.rows.map(rowToJob)
}

const retryJob0 = (db: Db, id: number): Promise<void> =>
  db.query('UPDATE jobs SET status = $1, attempts = 0, retry_at = NULL, last_error = NULL WHERE id = $2 AND status = $3', [
    'pending',
    id,
    'failed',
  ]) as unknown as Promise<void>

const progress0 = (db: Db, id: number, done: number, total: number): Promise<void> =>
  db.query('UPDATE jobs SET progress_done = $1, progress_total = $2 WHERE id = $3', [done, total, id]) as unknown as Promise<void>

const clearJobs = (db: Db): Promise<void> => db.query('DELETE FROM jobs') as unknown as Promise<void>

const clearKbJobs = (db: Db, kb: string): Promise<void> => db.query('DELETE FROM jobs WHERE kb = $1', [kb]) as unknown as Promise<void>

const clearFileJob = (db: Db, kb: string, relPath: string): Promise<void> =>
  db.query('DELETE FROM jobs WHERE kb = $1 AND rel_path = $2', [kb, relPath]) as unknown as Promise<void>

const enqueueJobs0 = async (db: Db, jobs: NewJob[]): Promise<void> => {
  const sql = `
    INSERT INTO jobs (kb, rel_path, op, sha256, mtime, bytes, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    ON CONFLICT(kb, rel_path, op) DO UPDATE SET
      sha256 = EXCLUDED.sha256,
      mtime = EXCLUDED.mtime,
      bytes = EXCLUDED.bytes,
      status = CASE
        WHEN jobs.status = 'failed' THEN 'pending'
        ELSE jobs.status
      END,
      attempts = CASE
        WHEN jobs.status = 'failed' THEN 0
        ELSE jobs.attempts
      END,
      retry_at = CASE
        WHEN jobs.status = 'failed' THEN NULL
        ELSE jobs.retry_at
      END,
      last_error = NULL
  `
  for (const j of jobs) {
    await db.query(sql, [j.kb, j.relPath, j.op, j.sha256, j.mtime, j.bytes])
  }
}

const claimJobs0 = async (db: Db, limit: number): Promise<IndexJob[]> => {
  const sql = `
    UPDATE jobs SET status = 'processing', started_at = NOW(), progress_done = NULL, progress_total = NULL
    WHERE id IN (
      SELECT id FROM jobs WHERE status = 'pending' AND (retry_at IS NULL OR retry_at <= NOW())
      ORDER BY id LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `
  const res = await db.query<Record<string, unknown>>(sql, [limit])
  return res.rows.map(rowToJob)
}

const failJob0 = async (db: Db, id: number, error: string): Promise<void> => {
  const current = await db.query<{ attempts: number }>('SELECT attempts FROM jobs WHERE id = $1', [id])
  const attempts = Number(current.rows[0]?.attempts ?? 0) + 1
  const parked = attempts >= RETRY_MAX
  const retryAt = parked ? null : new Date(Date.now() + retryBackoffMs(attempts, RETRY_BASE_MS, RETRY_MAX_MS))
  await db.query(
    'UPDATE jobs SET attempts = $1, last_error = $2, status = $3, retry_at = $4, started_at = NULL, progress_done = NULL, progress_total = NULL WHERE id = $5',
    [attempts, error, parked ? 'failed' : 'pending', retryAt, id],
  )
}

const reclaimStale0 = async (db: Db, timeoutSeconds: number): Promise<number> => {
  const cutoff = new Date(Date.now() - timeoutSeconds * 1000).toISOString()
  const res = await db.query<{ id: number; attempts: number }>(
    "SELECT id, attempts FROM jobs WHERE status = 'processing' AND started_at < $1",
    [cutoff],
  )
  // Reclaiming counts as an attempt so a job can never loop forever between
  // reclaim and claim without eventually reaching 'failed'.
  for (const r of res.rows) {
    const attempts = Number(r.attempts) + 1
    const parked = attempts >= RETRY_MAX
    await db.query(
      'UPDATE jobs SET status = $1, attempts = $2, last_error = $3, retry_at = $4, started_at = NULL, progress_done = NULL, progress_total = NULL WHERE id = $5',
      [parked ? 'failed' : 'pending', attempts, 'reclaimed (stale)', parked ? null : new Date(), r.id],
    )
  }
  return res.rows.length
}

const stats0 = async (db: Db): Promise<JobStats> => {
  const res = await db.query<{ status: string; cnt: number }>(
    "SELECT status, COUNT(*)::int AS cnt FROM jobs WHERE status IN ('pending', 'processing', 'failed') GROUP BY status",
  )
  const m: JobStats = { pending: 0, processing: 0, failed: 0 }
  for (const r of res.rows) {
    if (r.status === 'pending') m.pending = r.cnt
    else if (r.status === 'processing') m.processing = r.cnt
    else if (r.status === 'failed') m.failed = r.cnt
  }
  return m
}

export const createJobQueueFromDb = (db: Db): JobQueue => {
  let migrated = false
  const ensureMigrated = async (): Promise<void> => {
    if (!migrated) {
      await db.exec(migrateSql)
      migrated = true
    }
  }

  const enqueue = async (jobs: NewJob[]): Promise<void> => {
    await ensureMigrated()
    await enqueueJobs0(db, jobs)
  }

  const claim = async (limit: number): Promise<IndexJob[]> => {
    await ensureMigrated()
    return claimJobs0(db, limit)
  }

  const complete = async (id: number, sha256?: string): Promise<void> => completeJob(db, id, sha256)

  const fail = async (id: number, error: string): Promise<void> => failJob0(db, id, error)

  const reclaimStale = async (timeoutSeconds: number): Promise<number> => {
    await ensureMigrated()
    return reclaimStale0(db, timeoutSeconds)
  }

  const stats = async (): Promise<JobStats> => {
    await ensureMigrated()
    return stats0(db)
  }

  const failedList = async (limit = 20): Promise<IndexJob[]> => failedList0(db, limit)

  const processingList = async (limit = 50): Promise<IndexJob[]> => processingList0(db, limit)

  const progress = async (id: number, done: number, total: number): Promise<void> => progress0(db, id, done, total)

  const retryJob = async (id: number): Promise<void> => retryJob0(db, id)

  const clear = async (): Promise<void> => clearJobs(db)

  const clearForKb = async (kb: string): Promise<void> => clearKbJobs(db, kb)

  const clearForFile = async (kb: string, relPath: string): Promise<void> => clearFileJob(db, kb, relPath)

  const close = async (): Promise<void> => {}

  return {
    enqueue,
    claim,
    complete,
    fail,
    reclaimStale,
    stats,
    failedList,
    processingList,
    progress,
    retryJob,
    clear,
    clearForKb,
    clearForFile,
    close,
  }
}

/** Create a PostgreSQL-backed job queue from the configured env connection.
 * Reuses the `poolToDb` adapter (prod: pg.Pool; tests: PGlite) so the queue and
 * the store share one Db implementation. Migration runs lazily on first use. */
export const createPgJobQueue = async (): Promise<JobQueue> => {
  const pool = new Pool(buildPoolConfig())
  try {
    return createJobQueueFromDb(poolToDb(pool))
  } catch (err) {
    await pool.end()
    throw err
  }
}
