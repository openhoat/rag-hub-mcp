import { existsSync } from "node:fs";
import { join } from "node:path";
import { env } from "../config.js";
import { getLogger } from "../log.js";
import type { IndexJob, JobQueue, Store, Worker } from "../types.js";
import { indexFile } from "./ingest.js";

const logger = getLogger("worker");

const KB_ROOT = env.KB_ROOT;
const CONCURRENCY = env.INDEXER_CONCURRENCY;
const STALE_TIMEOUT = env.INDEXER_STALE_TIMEOUT;

const POLL_INTERVAL_MS = 1000;

export const createWorker = (store: Store, queue: JobQueue): Worker => {
  let running = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  const inFlight = new Set<Promise<void>>();
  let drainResolve: (() => void) | null = null;

  const poll = async (): Promise<void> => {
    try {
      await queue.reclaimStale(STALE_TIMEOUT);
      const jobs = await queue.claim(CONCURRENCY);
      for (const job of jobs) {
        const p = processJob(job);
        inFlight.add(p);
        void p.finally(() => {
          inFlight.delete(p);
          checkDrain();
        });
      }
    } catch (err) {
      logger.error("worker poll failed", err);
    }
  };

  const processJob = async (job: IndexJob): Promise<void> => {
    const fullPath = join(KB_ROOT, job.kb, job.relPath);
    try {
      if (!existsSync(fullPath)) {
        await queue.complete(job.id);
        return;
      }
      const kbId = await store.getKbId(job.kb);
      if (!kbId) {
        await queue.complete(job.id);
        return;
      }
      const indexed = await indexFile(
        store,
        kbId,
        job.relPath,
        fullPath,
        job.sha256,
        {
          mtimeMs: job.mtime,
          size: job.bytes,
        },
      );
      if (indexed) {
        await queue.complete(job.id);
      } else {
        logger.warn("not indexable (no text): %s/%s", job.kb, job.relPath);
        await queue.complete(job.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const remaining =
        job.attempts + 1 < env.INDEXER_RETRY_MAX
          ? env.INDEXER_RETRY_MAX - (job.attempts + 1)
          : 0;
      if (remaining > 0) {
        logger.warn(
          "job %d failed (%d retries left): %s",
          job.id,
          remaining,
          msg,
        );
      } else {
        logger.error("job %d failed (no retries left): %s", job.id, msg);
      }
      await queue.fail(job.id, msg);
    }
  };

  const checkDrain = (): void => {
    if (drainResolve && inFlight.size === 0) {
      const resolve = drainResolve;
      drainResolve = null;
      resolve();
    }
  };

  const start = (): void => {
    if (running) return;
    running = true;
    const loop = async (): Promise<void> => {
      if (!running) return;
      await poll();
      if (running) {
        pollTimer = setTimeout(loop, POLL_INTERVAL_MS);
      }
    };
    void loop();
    logger.info(
      "worker started (concurrency=%d, retryMax=%d)",
      CONCURRENCY,
      env.INDEXER_RETRY_MAX,
    );
  };

  const stop = async (): Promise<void> => {
    running = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (inFlight.size > 0) {
      await Promise.allSettled(Array.from(inFlight));
    }
    logger.info("worker stopped");
  };

  const drain = async (): Promise<void> => {
    if (inFlight.size === 0) {
      // Also wait until queue has no pending jobs
      let stats = await queue.stats();
      while (stats.pending > 0 || stats.processing > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, POLL_INTERVAL_MS),
        );
        stats = await queue.stats();
      }
      return;
    }
    return new Promise<void>((resolve) => {
      drainResolve = resolve;
    });
  };

  return { start, stop, drain };
};
