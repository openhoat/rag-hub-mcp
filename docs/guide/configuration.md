# Configuration

All configuration is done through environment variables. Variables are validated at startup; the server fails fast with a clear message if a required variable is missing.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MCP_API_KEY` | _(required in HTTP)_ | Bearer token for REST + MCP over HTTP. Ignored in stdio mode. |
| `EMBEDDINGS_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible `/v1/embeddings` endpoint. |
| `EMBEDDINGS_API_KEY` | _(none)_ | Bearer token for the embeddings API. |
| `EMBEDDINGS_MODEL` | `bge-m3` | Embedding model name. |
| `KB_ROOT` | `./kbs` (stdio) / `/data/kbs` (http) | Root directory for knowledge base folders. |
| `SCAN_INTERVAL` | `300` | Scan interval in seconds (0 = disabled). HTTP mode only. |
| `PORT` | `8000` | HTTP listen port. HTTP mode only. |
| `DB_PATH` | `./rag.db` (stdio) / `/data/index/rag.db` (http) | SQLite database path. |
| `CORS_ORIGINS` | _(none)_ | Allowed CORS origins (comma-separated). Empty = disables the CORS restriction. |
| `RAG_TRANSPORT` | `stdio` | `stdio` or `http`. The `--http` flag wins. |
| `RAG_VERSION` | `0.0.1` | Reported version. |

## Recommended embedding models

| Model | Notes |
|---|---|
| **bge-m3** | Multilingual (FR/EN), 1024d, best open-source retrieval, CPU-friendly. **Recommended.** |
| `nomic-embed-text` | Lighter, English-focused. |
| `text-embedding-3-small` | OpenAI API. |

Any OpenAI-compatible `/v1/embeddings` endpoint works — Ollama, Bifrost, OpenAI, LM Studio…

## Transport modes

- **stdio** (default): serve MCP tools on stdin/stdout for a local agent. No scan loop, no REST.
- **http** (`--http` / `RAG_TRANSPORT=http`): REST API + streamable-http MCP on `PORT`.

In stdio mode, logs go to stderr (stdout is reserved for JSON-RPC); there is no periodic scan.
