import Database from "better-sqlite3";
import { env } from "../config.js";
import type { IndexJob, JobQueue, JobStats, NewJob } from "../types.js";

const RETRY_MAX = env.INDEXER_RETRY_MAX;

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
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)");
};

const toJob = (r: unknown): IndexJob => {
  const row = r as {
    id: number;
    kb: string;
    rel_path: string;
    op: string;
    sha256: string;
    mtime: number;
    bytes: number;
    status: string;
    attempts: number;
    last_error: string | null;
  };
  return {
    id: row.id,
    kb: row.kb,
    relPath: row.rel_path,
    op: row.op as IndexJob["op"],
    sha256: row.sha256,
    mtime: row.mtime,
    bytes: row.bytes,
    status: row.status as IndexJob["status"],
    attempts: row.attempts,
    lastError: row.last_error,
  };
};

export const createSqliteJobQueue = (dbPath: string): JobQueue => {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);

  const enqueue = async (jobs: NewJob[]): Promise<void> => {
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
    `);
    const txn = db.transaction(() => {
      for (const j of jobs) {
        insert.run(j.kb, j.relPath, j.op, j.sha256, j.mtime, j.bytes);
      }
    });
    txn();
  };

  const claim = async (limit: number): Promise<IndexJob[]> => {
    const rows = db.prepare("SELECT * FROM jobs WHERE status = ? ORDER BY id LIMIT ?").all("pending", limit) as unknown[];
    const now = Date.now();
    const update = db.prepare("UPDATE jobs SET status = ?, started_at = ? WHERE id = ?");
    for (const row of rows) {
      const r = row as { id: number; status: string };
      update.run("processing", now, r.id);
      r.status = "processing";
    }
    return rows.map(toJob);
  };

  const complete = async (id: number): Promise<void> => {
    db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  };

  const fail = async (id: number, error: string): Promise<void> => {
    db.prepare(
      `UPDATE jobs
       SET attempts = attempts + 1,
           last_error = ?,
           status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END,
           started_at = NULL
       WHERE id = ?`,
    ).run(error, RETRY_MAX, id);
  };

  const reclaimStale = async (timeoutSeconds: number): Promise<number> => {
    const cutoff = Date.now() - timeoutSeconds * 1000;
    const r = db
      .prepare(
        "UPDATE jobs SET status = ?, started_at = NULL WHERE status = ? AND started_at < ?",
      )
      .run("pending", "processing", cutoff);
    return r.changes;
  };

  const stats = async (): Promise<JobStats> => {
    const rows = db
      .prepare(
        "SELECT status, COUNT(*) AS cnt FROM jobs WHERE status IN ('pending', 'processing', 'failed') GROUP BY status",
      )
      .all() as { status: string; cnt: number }[];
    const m: JobStats = { pending: 0, processing: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === "pending") m.pending = r.cnt;
      else if (r.status === "processing") m.processing = r.cnt;
      else if (r.status === "failed") m.failed = r.cnt;
    }
    return m;
  };

  const failedList = async (limit = 20): Promise<IndexJob[]> => {
    const rows = db
      .prepare("SELECT * FROM jobs WHERE status = ? ORDER BY id DESC LIMIT ?")
      .all("failed", limit) as unknown[];
    return rows.map(toJob);
  };

  const retryJob = async (id: number): Promise<void> => {
    db.prepare(
      "UPDATE jobs SET status = ?, attempts = ?, last_error = NULL WHERE id = ? AND status = ?",
    ).run("pending", 0, id, "failed");
  };

  const clear = async (): Promise<void> => {
    db.prepare("DELETE FROM jobs").run();
  };

  const clearForKb = async (kb: string): Promise<void> => {
    db.prepare("DELETE FROM jobs WHERE kb = ?").run(kb);
  };

  const clearForFile = async (kb: string, relPath: string): Promise<void> => {
    db.prepare("DELETE FROM jobs WHERE kb = ? AND rel_path = ?").run(
      kb,
      relPath,
    );
  };

  const close = async (): Promise<void> => {
    db.close();
  };

  return {
    enqueue,
    claim,
    complete,
    fail,
    reclaimStale,
    stats,
    failedList,
    retryJob,
    clear,
    clearForKb,
    clearForFile,
    close,
  };
};
