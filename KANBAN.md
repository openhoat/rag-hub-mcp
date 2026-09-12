# KANBAN

## Backlog

### #1 [FEAT] MCP tool `rag_read` — retrieve full document content by path

- [ ] Implementation

### #2 [FEAT] Search with KB filter accepts comma-separated list (`kb="infra,dev"`)

- [ ] Implementation

### #3 [FEAT] Content extraction improvement: markdown section metadata, metadata YAML frontmatter

- [ ] Implementation

### #4 [FEAT] Open WebUI default tool model binding, per-user access via custom headers

- [ ] Implementation

### #7 [FEAT] File-based document list via posit/download hook in the watch flow

- [ ] Implementation

### #8 [FEAT] Open Notebook embedding provider pointing to `EMBEDDINGS_BASE_URL`

- [ ] Implementation

### #9 [SECURITY] Enforce `relative()` containment check in `addDocument` (P1)

- [x] Replace `replaceAll('../', '')` sanitization with `relative()` check in `src/core/ingest.ts` (same as `deleteDocument`)

### #10 [SECURITY] Validate `content` is a string in REST add-document (P1)

- [x] Replace `content as string` with Zod validation in `src/transport/rest.ts`

## In Progress

### #12 [DOCS] Update `architecture.md` Express references to Fastify

- [x] Replace "Express" with "Fastify" in docs/guide/architecture.md and document the reply.hijack() pattern

### #16 [SECURITY] Add TTL and max-session-count to MCP session manager (P2)

- [x] Evict stale `Mcp-Session-Id` entries to prevent unbounded memory growth on client disconnect

### #17 [SECURITY] Add rate limiting to HTTP endpoints (P2)

- [x] Rate-limit `/search`, `/admin/reindex`, and MCP session creation


