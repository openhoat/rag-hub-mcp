# KANBAN

Open work only. Finished items leave the board once merged and released — the
released history lives in [CHANGELOG.md](CHANGELOG.md) and `git log`.

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

## In Progress
