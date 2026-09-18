# KANBAN

## Backlog

### #4 [FEAT] Open WebUI default tool model binding, per-user access via custom headers

- [ ] Implementation

### #7 [FEAT] File-based document list via posit/download hook in the watch flow

- [ ] Implementation

### #8 [FEAT] Open Notebook embedding provider pointing to `EMBEDDINGS_BASE_URL`

- [ ] Implementation

### #9 [ARCHITECTURE] Make Store interface async + introduce PostgreSQL backend (P2)

- [x] Phase 1: make Store async, encapsulate store.db, fix SIGABRT
- [x] Audit impact & choose direction (PostgreSQL + pgvector pluggable)
- [x] Phase 2: pluggable PostgreSQL backend
  - [x] Abstract FTS signature (`searchFts(words[])`) in types.ts / store.ts / search.ts
  - [x] Add PostgreSQL config (STORE_BACKEND, DATABASE_URL/PG_*, EMBEDDINGS_DIMENSION) to config.ts + .env.example
  - [x] Implement PgStore (src/core/pgStore.ts): pg + pgvector + generated tsv/ts_rank FTS
  - [x] storeFactory.ts pluggable selection (sqlite default / postgres opt-in), index.ts
  - [x] pg dependency + e2e pgstore.e2e.test.ts via PGlite in-memory (Postgres WASM + pgvector, no docker/server)
  - [x] Update docs (architecture, configuration, README)

## In Progress

### #12 [ARCHITECTURE] Async indexing via job queue + worker (P2)

- [ ] JobQueue interface + SqliteJobQueue + PgJobQueue (store table, future Redis pluggable)
- [ ] scanAll → producer (enqueue jobs, return ScanResult)
- [ ] Worker consumer loop (concurrency, retry, stale reclaim) — runs in stdio + HTTP
- [ ] Config: INDEXER_CONCURRENCY=4, INDEXER_RETRY_MAX=3, INDEXER_STALE_TIMEOUT=300
- [ ] Observabilité: rag_status + /admin/status + /admin/jobs (pending/processing/failed)
- [ ] Tests + validation
