# KANBAN

## Backlog

### #4 [FEAT] Open WebUI default tool model binding, per-user access via custom headers

- [ ] Implementation

### #7 [FEAT] File-based document list via posit/download hook in the watch flow

- [ ] Implementation

### #8 [FEAT] Open Notebook embedding provider pointing to `EMBEDDINGS_BASE_URL`

- [ ] Implementation

### #13 [PERF] In-memory O(N) search — pgvector unused

- [ ] push cosine distance into SQL (`<=>` + index) on the Postgres side
- [ ] consider an ANN index for SQLite (or a bound + rerank)

### #14 [PERF] Ingestion with no file size bound

- [ ] reject/skip beyond a configurable threshold before `readFileSync`/`hashFile`

### #18 [QA] Low coverage of critical code

- [ ] `worker.ts` (~70%: `stop`/`drain`/error branches left, `worker.unit.test.ts` added), `postgres/job-queue.ts` (~0%), `db.ts` (~19%): poll/claim/retry/reclaimStale

### #19 [TECH] Minor tech debt

- [ ] Docker image: `npm prune --omit=dev` (devDeps currently bundled)
- [ ] `chunk.ts`: metadata built twice, `headings` = last paragraph of the chunk
- [ ] scan/worker race on `processing` jobs (lost update self-heals but is inconsistent)

### #20 [TECH] `createPgJobQueue` reimplements `poolToDb` (divergent `Db` adapter)

- [ ] build the queue via `poolToDb(new Pool(buildPoolConfig()))` instead of the inline `Db` object
- [ ] fix `exec` (`splitStatements`) so `migrateSql` (2 statements) passes
- [ ] test `job-queue` via `pgliteToDb` (same seam as the store)

## In Progress

## Done

### #21 [BUG] Indexing jobs have no execution deadline — slow downstream hangs forever

- [x] add `INDEXER_JOB_TIMEOUT_MS` env (default 600s) and abort each job's `indexFile` when exceeded
- [x] thread an `AbortSignal` through `indexFile` → `embedTexts`/`embedBatch` and `enrichChunkContent` (combine with the per-call timeout via `AbortSignal.any`)
- [x] on abort, surface a clean error to `handleJobError` so the job fails (and retries with backoff) instead of spinning
- [x] guard `INDEXER_JOB_TIMEOUT_MS < INDEXER_STALE_TIMEOUT` (startup warning in `index.ts`; a zod refine would hard-fail startup on the historical default, so a warning was kept instead)

### #22 [FEAT] Exponential backoff between indexer retries

- [x] add `retry_at` (next eligible claim time) to `jobs` (sqlite + postgres migrations, `ADD COLUMN` idempotent)
- [x] `failJob` sets `retry_at = now + backoff(attempts)` (`retryBackoffMs`, capped at `INDEXER_RETRY_MAX_MS`)
- [x] `claimJobs` filters `status='pending' AND (retry_at IS NULL OR retry_at <= now)`
- [x] unit tests for the backoff schedule (`job-queue.unit.test.ts`, `pg-job-queue.e2e.test.ts`)

### #23 [BUG] reclaimStale can re-claim a job still being processed (double execution)

- [x] track in-flight job ids in the worker and skip re-claiming them
- [x] make `reclaimStale` only recover orphaned jobs (crashed worker), not slow live jobs (invariant enforced via #21)
- [x] increment `attempts` (and park at `failed`) on reclaim instead of silently resetting to pending
- [x] cross-ref #19 (scan/worker race on `processing`)

### #24 [BUG] Per-chunk embedding fallback is unbounded

- [x] cap the per-chunk retry loop (max 2 attempts + 250 ms delay) in `ingest.ts` `indexFile`
- [x] add a short delay/backoff between per-chunk retries
- [x] keep chunks with null embeddings (already tracked via `needsReembed`) instead of spinning; a job-level abort is always re-thrown

### #25 [FEAT] Indexing observability — per-job progress + null-embedding count

- [x] expose per-job progress (chunks done/total) via `/admin/status` and `rag_status`
- [x] report the count of files with null embeddings (indexed but unsearchable) via `GET /admin/status` / `rag_status`, and list `processing` jobs with their age via `GET /admin/jobs` / `rag_jobs`

### #26 [PERF] Contextual chunking = N LLM calls per document (fragile laptop dependency)

- [x] point `CONTEXTUAL_CHUNKING_BASE_URL`/`MODEL` at a reliable cloud endpoint instead of `ollama-laptop` (done in the infra stack `.env.op3n-cloud`)
- [x] make `CONTEXTUAL_CHUNKING_CONCURRENCY`/`TIMEOUT_MS` explicit and tuned for the target (infra stack env)
- [x] fast, bounded fallback to raw chunks when the context call is slow/unavailable (existing try/catch, now abort-aware)

## In Progress
