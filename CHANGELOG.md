# Changelog

## [Unreleased]

### Added

- `rag_read` tool to retrieve the full extracted content of a document by KB and path
- Markdown YAML frontmatter extraction (parsed, stripped from content, exposed as metadata)
- Per-chunk section metadata: each chunk carries the heading path of its section
- Multi-KB search filter accepting a comma-separated `kb` list (`rag_search`, `/search`)
- MCP session TTL and max-session-count to prevent unbounded memory growth
- HTTP rate limiting on `/search`, `/admin/reindex`, and MCP session creation
- Fastify `reply.hijack()` pattern for the MCP streamable-http transport
- Pluggable PostgreSQL backend with pgvector (`STORE_BACKEND=postgres`, `DATABASE_URL`/`PG_*`)
- `searchFts(words[])` + `Float32Array` embeddings — backend-neutral `Store` contract (no FTS5/rank convention leak)
- PostgreSQL e2e via in-memory PGlite (Postgres WASM + pgvector, no server/docker)

### Fixed

- Path containment in `addDocument` using the `relative()` check instead of string sanitization
- Validate that `content` is a string in the REST add-document endpoint (Zod)
- Fail fast when `MCP_API_KEY` is empty in HTTP mode
- Strip NUL bytes from extracted text (PostgreSQL rejects `\0` in TEXT, broke PDF indexing)
- Bind HTTP server to `0.0.0.0` so reverse proxies (Traefik) can reach the container (was `localhost` → 502)
- Upgrade `better-sqlite3` 11→12 to fix native `RemoveEnvironmentCleanupHook` SIGABRT at test teardown
- Route pdf.js diagnostics through pino so they respect `LOG_LEVEL`

### Changed

- Migrated REST and MCP HTTP layer from Express to Fastify
- Reorganized sources into layered modules (`core/`, `pipeline/`, `transport/`)
- Renamed `RAG_VERSION`→`VERSION`, `RAG_LOG_LEVEL`→`LOG_LEVEL` (generic env var names)
- Decoupled `PgStore` from the `pg` driver via an injectable `Db` interface (tests use PGlite)
- `storeFactory.ts` selects the backend (`sqlite` default / `postgres` opt-in)

### Documentation

- Rewrote architecture guide (Express → Fastify, `reply.hijack()`, pluggable backends)
- Enriched README, added MCP inspector script
- Documented `STORE_BACKEND`, `DATABASE_URL`/`PG_*`, `EMBEDDINGS_DIMENSION` in configuration guide

## [0.0.1] — 2026-09-11

### Added

- Initial implementation of rag-hub-mcp
- MCP server with 8 tools (search, list, add, delete, reindex, status)
- REST API (health, search, admin CRUD)
- Knowledge bases from folders (1st level = KB)
- Incremental file scanning with SHA-256 diff
- OpenAI-compatible embeddings provider (Bifrost, Ollama, OpenAI…)
- Hybrid search (cosine similarity + FTS5 keyword)
- Document extraction: md/txt/code, PDF, DOCX, XLSX, PPTX
- Configurable scan interval, bearer auth, SQLite persistence
- Ready for Open WebUI, OpenCode, Claude Code, dsh