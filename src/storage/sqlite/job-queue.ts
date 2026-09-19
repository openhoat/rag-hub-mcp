import Database from 'better-sqlite3'
import { env } from '../../shared/config.js'
import type { IndexJob, JobQueue, JobStats, NewJob } from '../../shared/types.js'

const RETRY_MAX = env.INDEXER_RETRY_MAX

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
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(kb, rel_path, op)
    )
  `)
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
  const rows = db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY id LIMIT ?').all('pending', limit) as unknown[]
  const now = Date.now()
  const update = db.prepare('UPDATE jobs SET status = ?, started_at = ? WHERE id = ?')
  for (const row of rows) {
    const r = row as { id: number; status: string }
    update.run('processing', now, r.id)
    r.status = 'processing'
  }
  return rows.map(toJob)
}

const completeJob = (db: Database.Database, id: number): void => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id)
}

const failJob = (db: Database.Database, id: number, error: string): void => {
  db.prepare(
    `UPDATE jobs
     SET attempts = attempts + 1,
         last_error = ?,
         status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END,
         started_at = NULL
     WHERE id = ?`,
  ).run(error, RETRY_MAX, id)
}

const reclaimStaleJobs = (db: Database.Database, timeoutSeconds: number): number => {
  const cutoff = Date.now() - timeoutSeconds * 1000
  const r = db
    .prepare('UPDATE jobs SET status = ?, started_at = NULL WHERE status = ? AND started_at < ?')
    .run('pending', 'processing', cutoff)
  return r.changes
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

const retryJobById = (db: Database.Database, id: number): void => {
  db.prepare('UPDATE jobs SET status = ?, attempts = ?, last_error = NULL WHERE id = ? AND status = ?').run('pending', 0, id, 'failed')
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
    complete: id => {
      completeJob(db, id)
      return Promise.resolve()
    },
    fail: (id, error) => {
      failJob(db, id, error)
      return Promise.resolve()
    },
    reclaimStale: timeout => Promise.resolve(reclaimStaleJobs(db, timeout)),
    stats: () => Promise.resolve(jobStats(db)),
    failedList: limit => Promise.resolve(failedJobs(db, limit)),
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
