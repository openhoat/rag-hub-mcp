import { Pool } from "pg";
import { env } from "../config.js";
import type { IndexJob, JobQueue, JobStats, NewJob } from "../types.js";
import type { Db } from "./pg-store.js";
import { buildPoolConfig } from "./pg-store.js";

const RETRY_MAX = env.INDEXER_RETRY_MAX;

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(kb, rel_path, op)
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
`;

const rowToJob = (r: Record<string, unknown>): IndexJob => ({
  id: r.id as number,
  kb: r.kb as string,
  relPath: r.rel_path as string,
  op: r.op as IndexJob["op"],
  sha256: r.sha256 as string,
  mtime: Number(r.mtime),
  bytes: Number(r.bytes),
  status: r.status as IndexJob["status"],
  attempts: r.attempts as number,
  lastError: (r.last_error as string) ?? null,
});

export const createJobQueueFromDb = (db: Db): JobQueue => {
  let migrated = false;
  const ensureMigrated = async (): Promise<void> => {
    if (!migrated) {
      await db.exec(migrateSql);
      migrated = true;
    }
  };

  const enqueue = async (jobs: NewJob[]): Promise<void> => {
    await ensureMigrated();
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
        last_error = NULL
    `;
    for (const j of jobs) {
      await db.query(sql, [j.kb, j.relPath, j.op, j.sha256, j.mtime, j.bytes]);
    }
  };

  const claim = async (limit: number): Promise<IndexJob[]> => {
    await ensureMigrated();
    const sql = `
      UPDATE jobs SET status = 'processing', started_at = NOW()
      WHERE id IN (
        SELECT id FROM jobs WHERE status = 'pending'
        ORDER BY id LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;
    const res = await db.query<Record<string, unknown>>(sql, [limit]);
    return res.rows.map(rowToJob);
  };

  const complete = async (id: number): Promise<void> => {
    await db.query("DELETE FROM jobs WHERE id = $1", [id]);
  };

  const fail = async (id: number, error: string): Promise<void> => {
    await db.query(
      `UPDATE jobs
       SET attempts = attempts + 1,
           last_error = $1,
           status = CASE WHEN attempts + 1 >= $2 THEN 'failed' ELSE 'pending' END,
           started_at = NULL
       WHERE id = $3`,
      [error, RETRY_MAX, id],
    );
  };

  const reclaimStale = async (timeoutSeconds: number): Promise<number> => {
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000).toISOString();
    const res = await db.query<Record<string, unknown>>(
      "UPDATE jobs SET status = $1, started_at = NULL WHERE status = $2 AND started_at < $3 RETURNING id",
      ["pending", "processing", cutoff],
    );
    return res.rows.length;
  };

  const stats = async (): Promise<JobStats> => {
    const res = await db.query<{ status: string; cnt: number }>(
      "SELECT status, COUNT(*)::int AS cnt FROM jobs WHERE status IN ('pending', 'processing', 'failed') GROUP BY status",
    );
    const m: JobStats = { pending: 0, processing: 0, failed: 0 };
    for (const r of res.rows) {
      if (r.status === "pending") m.pending = r.cnt;
      else if (r.status === "processing") m.processing = r.cnt;
      else if (r.status === "failed") m.failed = r.cnt;
    }
    return m;
  };

  const failedList = async (limit = 20): Promise<IndexJob[]> => {
    const res = await db.query<Record<string, unknown>>(
      "SELECT * FROM jobs WHERE status = $1 ORDER BY id DESC LIMIT $2",
      ["failed", limit],
    );
    return res.rows.map(rowToJob);
  };

  const retryJob = async (id: number): Promise<void> => {
    await db.query(
      "UPDATE jobs SET status = $1, attempts = 0, last_error = NULL WHERE id = $2 AND status = $3",
      ["pending", id, "failed"],
    );
  };

  const clear = async (): Promise<void> => {
    await db.query("DELETE FROM jobs");
  };

  const clearForKb = async (kb: string): Promise<void> => {
    await db.query("DELETE FROM jobs WHERE kb = $1", [kb]);
  };

  const clearForFile = async (kb: string, relPath: string): Promise<void> => {
    await db.query("DELETE FROM jobs WHERE kb = $1 AND rel_path = $2", [
      kb,
      relPath,
    ]);
  };

  const close = async (): Promise<void> => {};

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

export const createPgJobQueue = async (): Promise<JobQueue> => {
  const pool = new Pool(buildPoolConfig());
  const db: Db = {
    query: async <TResult extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): Promise<{ rows: TResult[] }> => {
      const res = await pool.query(sql, params);
      return { rows: res.rows as TResult[] };
    },
    exec: async (sql: string): Promise<void> => {
      await pool.query(sql);
    },
    transaction: async <T>(
      fn: (client: { query: Db["query"] }) => Promise<T>,
    ): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          query: async <TResult extends Record<string, unknown>>(
            sql: string,
            params?: unknown[],
          ): Promise<{ rows: TResult[] }> => {
            const res = await client.query(sql, params);
            return { rows: res.rows as TResult[] };
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    close: async () => {
      await pool.end();
    },
  };
  const queue = createJobQueueFromDb(db);
  return queue;
};
