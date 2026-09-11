# Changelog

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