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
