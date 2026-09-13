# Configuration

All configuration is done through environment variables. Variables are validated at startup; the server fails fast with a clear message if a required variable is missing.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MCP_API_KEY` | _(required in HTTP)_ | Bearer token for REST + MCP over HTTP. Ignored in stdio mode. |
| `EMBEDDINGS_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible `/v1/embeddings` endpoint. |
| `EMBEDDINGS_API_KEY` | _(none)_ | Bearer token for the embeddings API. |
| `EMBEDDINGS_MODEL` | `bge-m3` | Embedding model name. |
| `EMBEDDINGS_DIMENSION` | `1024` | Fixed vector dimension for the embedding column (bge-m3 = 1024). Used by the PostgreSQL backend to size the pgvector column. |
| `KB_ROOT` | `./kbs` (stdio) / `/data/kbs` (http) | Root directory for knowledge base folders. |
| `SCAN_INTERVAL` | `300` | Scan interval in seconds (0 = disabled). HTTP mode only. |
| `PORT` | `8000` | HTTP listen port. HTTP mode only. |
| `DB_PATH` | `./rag.db` (stdio) / `/data/index/rag.db` (http) | SQLite database path. |
| `STORE_BACKEND` | `sqlite` | `sqlite` (default, standalone) or `postgres` (requires a reachable Postgres). |
| `DATABASE_URL` | _(none)_ | Postgres connection string. Takes precedence over the individual `PG_*` vars. |
| `PG_HOST` | `localhost` | Postgres host. |
| `PG_PORT` | `5432` | Postgres port. |
| `PG_DATABASE` | `raghub` | Postgres database name. |
| `PG_USER` | _(none)_ | Postgres user. |
| `PG_PASSWORD` | _(none)_ | Postgres password. |
| `PG_SSL` | `false` | Enable TLS for the Postgres connection. |
| `CORS_ORIGINS` | _(none)_ | Allowed CORS origins (comma-separated). Empty = disables the CORS restriction. |
| `RAG_TRANSPORT` | `stdio` | `stdio` or `http`. The `--http` flag wins. |
| `VERSION` | `0.0.1` | Reported version. |

## Recommended embedding models

| Model | Notes |
|---|---|
| **bge-m3** | Multilingual (FR/EN), 1024d, best open-source retrieval, CPU-friendly. **Recommended.** |
| `nomic-embed-text` | Lighter, English-focused. |
| `text-embedding-3-small` | OpenAI API. |

Any OpenAI-compatible `/v1/embeddings` endpoint works — Ollama, Bifrost, OpenAI, LM Studio…

## Storage backends

Two backends implement the same `Store` interface. SQLite is the default and
runs standalone; PostgreSQL is opt-in.

### SQLite (default)

A single file (`DB_PATH`) with FTS5 full-text search. No database server
required — nothing else to start.

### PostgreSQL (pgvector)

Opt-in for deployments that prefer a server-side store. Embeds the pgvector
extension (vector column + `ts_rank` full-text search). Enable it with:

```bash
# docker-compose.yml ships a local pgvector image for dev/tests
docker compose up -d postgres

# then point the server at it
STORE_BACKEND=postgres \
DATABASE_URL=postgres://raghub:raghub@localhost:5432/raghub \
node dist/index.js
```

The schema and the `vector` extension are created idempotently on first
connect. Set `EMBEDDINGS_DIMENSION` to match your model before ingesting —
the column is sized once at migration time.

## Transport modes

- **stdio** (default): serve MCP tools on stdin/stdout for a local agent. No scan loop, no REST.
- **http** (`--http` / `RAG_TRANSPORT=http`): REST API + streamable-http MCP on `PORT`.

In stdio mode, logs go to stderr (stdout is reserved for JSON-RPC); there is no periodic scan.
