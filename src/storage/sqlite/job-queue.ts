import Database from 'better-sqlite3'
import { retryBackoffMs } from '../../shared/backoff.js'
import { env } from '../../shared/config.js'
import type { IndexJob, JobQueue, JobStats, NewJob } from '../../shared/types.js'

const RETRY_MAX = env.INDEXER_RETRY_MAX
const RETRY_BASE_MS = env.INDEXER_RETRY_BASE_MS
const RETRY_MAX_MS = env.INDEXER_RETRY_MAX_MS

const migrate = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kb TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      op TEXT NOT NULL DEFAULT 'index',
      sha256 TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      started_at INTEGER,
      retry_at INTEGER,
      progress_done INTEGER,
      progress_total INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(kb, rel_path, op)
    )
  `)
  // Existing databases created before these columns existed: add them idempotently.
  const columns = new Set((db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map(c => c.name))
  if (!columns.has('retry_at')) {
    db.exec('ALTER TABLE jobs ADD COLUMN retry_at INTEGER')
  }
  if (!columns.has('progress_done')) {
    db.exec('ALTER TABLE jobs ADD COLUMN progress_done INTEGER')
  }
  if (!columns.has('progress_total')) {
    db.exec('ALTER TABLE jobs ADD COLUMN progress_total INTEGER')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)')
}

const toJob = (r: unknown): IndexJob => {
  const row = r as {
    id: number
    kb: string
    rel_path: string
    op: string
    sha256: string
    mtime: number
    bytes: number
    status: string
    attempts: number
    last_error: string | null
    started_at: number | null
    retry_at: number | null
    progress_done: number | null
    progress_total: number | null
  }
  return {
    id: row.id,
    kb: row.kb,
    relPath: row.rel_path,
    op: row.op as IndexJob['op'],
    sha256: row.sha256,
    mtime: row.mtime,
    bytes: row.bytes,
    status: row.status as IndexJob['status'],
    attempts: row.attempts,
    lastError: row.last_error,
    startedAt: row.started_at ?? null,
    retryAt: row.retry_at ?? null,
    progressDone: row.progress_done ?? null,
    progressTotal: row.progress_total ?? null,
  }
}

const enqueueJobs = (db: Database.Database, jobs: NewJob[]): Promise<void> => {
  const insert = db.prepare(`
    INSERT INTO jobs (kb, rel_path, op, sha256, mtime, bytes, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
    ON CONFLICT(kb, rel_path, op) DO UPDATE SET
      sha256 = excluded.sha256,
      mtime = excluded.mtime,
      bytes = excluded.bytes,
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
  `)
  const txn = db.transaction(() => {
    for (const j of jobs) {
      insert.run(j.kb, j.relPath, j.op, j.sha256, j.mtime, j.bytes)
    }
  })
  txn()
  return Promise.resolve()
}

const claimJobs = (db: Database.Database, limit: number): IndexJob[] => {
  const now = Date.now()
  const rows = db
    .prepare("SELECT * FROM jobs WHERE status = 'pending' AND (retry_at IS NULL OR retry_at <= ?) ORDER BY id LIMIT ?")
    .all(now, limit) as unknown[]
  const update = db.prepare('UPDATE jobs SET status = ?, started_at = ?, progress_done = NULL, progress_total = NULL WHERE id = ?')
  for (const row of rows) {
    const r = row as { id: number; status: string }
    update.run('processing', now, r.id)
    r.status = 'processing'
  }
  return rows.map(toJob)
}

// A job is only removed when it still carries the hash that was indexed. If a
// concurrent scan re-enqueued a newer version while the job was running, the
// stored sha256 has changed: re-arm the job as 'pending' instead of dropping the
// newer work (scan/worker lost update, KANBAN #19).
const completeJob = (db: Database.Database, id: number, sha256?: string): void => {
  if (sha256 === undefined) {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(id)
    return
  }
  const res = db.prepare('DELETE FROM jobs WHERE id = ? AND sha256 = ?').run(id, sha256)
  if (res.changes === 0) {
    db.prepare(
      "UPDATE jobs SET status = 'pending', started_at = NULL, progress_done = NULL, progress_total = NULL, retry_at = NULL WHERE id = ?",
    ).run(id)
  }
}

const failJob = (db: Database.Database, id: number, error: string): void => {
  const row = db.prepare('SELECT attempts FROM jobs WHERE id = ?').get(id) as { attempts: number } | undefined
  const attempts = (row?.attempts ?? 0) + 1
  const parked = attempts >= RETRY_MAX
  const retryAt = parked ? null : Date.now() + retryBackoffMs(attempts, RETRY_BASE_MS, RETRY_MAX_MS)
  db.prepare(
    'UPDATE jobs SET attempts = ?, last_error = ?, status = ?, retry_at = ?, started_at = NULL, progress_done = NULL, progress_total = NULL WHERE id = ?',
  ).run(attempts, error, parked ? 'failed' : 'pending', retryAt, id)
}

const reclaimStaleJobs = (db: Database.Database, timeoutSeconds: number): number => {
  const cutoff = Date.now() - timeoutSeconds * 1000
  const rows = db.prepare("SELECT id, attempts FROM jobs WHERE status = 'processing' AND started_at < ?").all(cutoff) as {
    id: number
    attempts: number
  }[]
  // Reclaiming is counted as an attempt so a job that never completes cannot
  // loop forever between reclaim and claim without ever reaching 'failed'.
  const update = db.prepare(
    'UPDATE jobs SET status = ?, attempts = ?, last_error = ?, retry_at = ?, started_at = NULL, progress_done = NULL, progress_total = NULL WHERE id = ?',
  )
  const now = Date.now()
  for (const r of rows) {
    const attempts = r.attempts + 1
    const parked = attempts >= RETRY_MAX
    update.run(parked ? 'failed' : 'pending', attempts, 'reclaimed (stale)', parked ? null : now, r.id)
  }
  return rows.length
}

const jobStats = (db: Database.Database): JobStats => {
  const rows = db
    .prepare("SELECT status, COUNT(*) AS cnt FROM jobs WHERE status IN ('pending', 'processing', 'failed') GROUP BY status")
    .all() as { status: string; cnt: number }[]
  const m: JobStats = { pending: 0, processing: 0, failed: 0 }
  for (const r of rows) {
    if (r.status === 'pending') m.pending = r.cnt
    else if (r.status === 'processing') m.processing = r.cnt
    else if (r.status === 'failed') m.failed = r.cnt
  }
  return m
}

const failedJobs = (db: Database.Database, limit = 20): IndexJob[] => {
  const rows = db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY id DESC LIMIT ?').all('failed', limit) as unknown[]
  return rows.map(toJob)
}

const processingJobs = (db: Database.Database, limit = 50): IndexJob[] => {
  const rows = db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY started_at LIMIT ?').all('processing', limit) as unknown[]
  return rows.map(toJob)
}

const setProgress = (db: Database.Database, id: number, done: number, total: number): void => {
  db.prepare('UPDATE jobs SET progress_done = ?, progress_total = ? WHERE id = ?').run(done, total, id)
}

const retryJobById = (db: Database.Database, id: number): void => {
  db.prepare('UPDATE jobs SET status = ?, attempts = ?, retry_at = NULL, last_error = NULL WHERE id = ? AND status = ?').run(
    'pending',
    0,
    id,
    'failed',
  )
}

const clearAllJobs = (db: Database.Database): void => {
  db.prepare('DELETE FROM jobs').run()
}

const clearJobsForKb = (db: Database.Database, kb: string): void => {
  db.prepare('DELETE FROM jobs WHERE kb = ?').run(kb)
}

const clearJobsForFile = (db: Database.Database, kb: string, relPath: string): void => {
  db.prepare('DELETE FROM jobs WHERE kb = ? AND rel_path = ?').run(kb, relPath)
}

const closeDb = (db: Database.Database): void => {
  db.close()
}

export const createSqliteJobQueue = (dbPath: string): JobQueue => {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  migrate(db)

  return {
    enqueue: jobs => enqueueJobs(db, jobs),
    claim: limit => Promise.resolve(claimJobs(db, limit)),
    complete: (id, sha256) => {
      completeJob(db, id, sha256)
      return Promise.resolve()
    },
    fail: (id, error) => {
      failJob(db, id, error)
      return Promise.resolve()
    },
    reclaimStale: timeout => Promise.resolve(reclaimStaleJobs(db, timeout)),
    stats: () => Promise.resolve(jobStats(db)),
    failedList: limit => Promise.resolve(failedJobs(db, limit)),
    processingList: limit => Promise.resolve(processingJobs(db, limit)),
    progress: (id, done, total) => {
      setProgress(db, id, done, total)
      return Promise.resolve()
    },
    retryJob: id => {
      retryJobById(db, id)
      return Promise.resolve()
    },
    clear: () => {
      clearAllJobs(db)
      return Promise.resolve()
    },
    clearForKb: kb => {
      clearJobsForKb(db, kb)
      return Promise.resolve()
    },
    clearForFile: (kb, relPath) => {
      clearJobsForFile(db, kb, relPath)
      return Promise.resolve()
    },
    close: () => {
      closeDb(db)
      return Promise.resolve()
    },
  }
}
