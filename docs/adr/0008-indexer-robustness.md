---
status: accepted
---

# Indexer robustness: per-job deadline, retry backoff and safe reclaim

A slow or half-down embeddings / contextual-chunking backend used to make large
documents take arbitrarily long, and the queue could re-claim a job that was
still running (stale reclaim reset it to `pending` without counting an attempt),
so a document could silently never finish indexing. The queue now bounds each
job, spaces out retries and refuses to double-run a job.

## Consequences

- Every job runs under `INDEXER_JOB_TIMEOUT_MS`; on expiry its `AbortSignal` is
  propagated to the HTTP calls and the job is failed instead of hanging a slot.
- A failed attempt is parked `pending` with a `retry_at` backoff
  (`INDEXER_RETRY_BASE_MS * 2^(attempts-1)`, capped at `INDEXER_RETRY_MAX_MS`)
  so the provider is not hammered.
- Reclaiming a stale job counts as an attempt, so a job that never completes
  eventually parks as `failed` instead of looping between reclaim and claim.
- The worker tracks in-flight job ids and never starts a second execution of a
  job whose previous attempt is still running.
- The per-chunk embedding fallback is bounded (max attempts + delay); an aborted
  job is always surfaced, never swallowed per-chunk.
- Documents left with null-embedding chunks are counted in `rag_status` /
  `GET /admin/status`, and `processing` jobs are listed with their age.
- `INDEXER_STALE_TIMEOUT` must stay above `INDEXER_JOB_TIMEOUT_MS`/1000; the
  server logs a warning when the configuration violates it.
