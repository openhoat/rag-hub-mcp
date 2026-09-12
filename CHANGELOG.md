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

### Fixed

- Path containment in `addDocument` using the `relative()` check instead of string sanitization
- Validate that `content` is a string in the REST add-document endpoint (Zod)
- Fail fast when `MCP_API_KEY` is empty in HTTP mode

### Changed

- Migrated REST and MCP HTTP layer from Express to Fastify
- Reorganized sources into layered modules (`core/`, `pipeline/`, `transport/`)

### Documentation

- Rewrote architecture guide (Express → Fastify, `reply.hijack()`)
- Enriched README, added MCP inspector script

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