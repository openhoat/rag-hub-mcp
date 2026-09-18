# Configuration

All configuration is done through environment variables. Variables are validated at startup; the server fails fast with a clear message if a required variable is missing.

## Environment variables

| Variable                       | Default                                          | Description                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MCP_API_KEY`                  | _(required in HTTP)_                             | Bearer token for REST + MCP over HTTP. Ignored in stdio mode.                                                                                                                                    |
| `EMBEDDINGS_BASE_URL`          | `http://localhost:11434/v1`                      | OpenAI-compatible `/v1/embeddings` endpoint.                                                                                                                                                     |
| `EMBEDDINGS_API_KEY`           | _(none)_                                         | Bearer token for the embeddings API.                                                                                                                                                             |
| `EMBEDDINGS_MODEL`             | `bge-m3`                                         | Embedding model name.                                                                                                                                                                            |
| `EMBEDDINGS_DIMENSION`         | `1024`                                           | Fixed vector dimension for the embedding column (bge-m3 = 1024). Used by the PostgreSQL backend to size the pgvector column.                                                                     |
| `CHUNK_MAX_CHARS`              | `3200`                                           | Maximum characters per text chunk. Lower it for small-token embedding models. See [Chunk sizing](#chunk-sizing) below.                                                                           |
| `CONTEXTUAL_CHUNKING_ENABLED`  | `false`                                          | At indexing time, generate a short context sentence per chunk (via the configured LLM) that is prepended to the chunk before embedding. See [Contextual chunking](#contextual-chunking) below.   |
| `CONTEXTUAL_CHUNKING_BASE_URL` | `EMBEDDINGS_BASE_URL`                            | OpenAI-compatible `/v1/chat/completions` endpoint used to generate chunk context. Defaults to the embeddings base URL.                                                                           |
| `CONTEXTUAL_CHUNKING_MODEL`    | `phi3:minimal`                                   | Lightweight LLM that writes the per-chunk context sentence.                                                                                                                                      |
| `KB_ROOT`                      | `./kbs` (stdio) / `/data/kbs` (http)             | Root directory for knowledge base folders.                                                                                                                                                       |
| `SCAN_INTERVAL`                | `300`                                            | Scan interval in seconds (0 = disabled). HTTP mode only.                                                                                                                                         |
| `PORT`                         | `8000`                                           | HTTP listen port. HTTP mode only.                                                                                                                                                                |
| `DB_PATH`                      | `./rag.db` (stdio) / `/data/index/rag.db` (http) | SQLite database path.                                                                                                                                                                            |
| `STORE_BACKEND`                | `sqlite`                                         | `sqlite` (default, standalone) or `postgres` (requires a reachable Postgres).                                                                                                                    |
| `DATABASE_URL`                 | _(none)_                                         | Postgres connection string. Takes precedence over the individual `PG_*` vars.                                                                                                                    |
| `PG_HOST`                      | `localhost`                                      | Postgres host.                                                                                                                                                                                   |
| `PG_PORT`                      | `5432`                                           | Postgres port.                                                                                                                                                                                   |
| `PG_DATABASE`                  | `raghub`                                         | Postgres database name.                                                                                                                                                                          |
| `PG_USER`                      | _(none)_                                         | Postgres user.                                                                                                                                                                                   |
| `PG_PASSWORD`                  | _(none)_                                         | Postgres password.                                                                                                                                                                               |
| `PG_SSL`                       | `false`                                          | Enable TLS for the Postgres connection.                                                                                                                                                          |
| `CORS_ORIGINS`                 | _(none)_                                         | Allowed CORS origins (comma-separated). Empty = disables the CORS restriction.                                                                                                                   |
| `TEXT_EXTENSIONS`              | _(none)_                                         | Additional text extensions to index (comma-separated, e.g. `.kt,.java,.go`). Merged with the built-in list, not replacing it. Unknown extensions are also auto-detected as text via magic bytes. |
| `RAG_TRANSPORT`                | `stdio`                                          | `stdio` or `http`. The `--http` flag wins.                                                                                                                                                       |
| `VERSION`                      | `1.2.1`                                          | Reported version.                                                                                                                                                                                |

## Recommended embedding models

| Model                    | Notes                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------- |
| **bge-m3**               | Multilingual (FR/EN), 1024d, best open-source retrieval, CPU-friendly. **Recommended.** |
| `nomic-embed-text`       | Lighter, English-focused.                                                               |
| `text-embedding-3-small` | OpenAI API.                                                                             |

Any OpenAI-compatible `/v1/embeddings` endpoint works — Ollama, Bifrost, OpenAI, LM Studio…

## Chunk sizing

`CHUNK_MAX_CHARS` caps the size of each chunk fed to the embedding model. If a
chunk exceeds the model's token limit, the embeddings call fails. Estimate a
safe value for your model with:

```text
CHUNK_MAX_CHARS ≈ chars-per-token × token limit
```

The chars-per-token ratio depends on the script. Dense scripts tokenize
heavily, so a character budget that works in English can overflow a small-token
model in another language.

| Script          | Chars/token | `CHUNK_MAX_CHARS` for a 512-token model |
| --------------- | ----------- | --------------------------------------- |
| Latin (EN, FR…) | ~4          | ~2000                                   |
| Cyrillic (RU…)  | ~2.5        | ~1200                                   |

Lower `CHUNK_MAX_CHARS` when you use a small-token model (e.g. 512) or dense
scripts. The 400-character overlap is preserved independently of this value.

## Contextual chunking

When enabled, a lightweight LLM writes a short context sentence for each chunk
at indexing time. That sentence is prepended to the chunk **only when
computing the embedding** — the stored content stays unchanged. This anchors the
vector to its place in the document, improving search precision at zero runtime
latency (the cost is paid once, per chunk, when re-indexing).

```bash
CONTEXTUAL_CHUNKING_ENABLED=true \
CONTEXTUAL_CHUNKING_BASE_URL=http://localhost:11434/v1 \
CONTEXTUAL_CHUNKING_MODEL=phi3:minimal
```

Opt-in and default-off. `CONTEXTUAL_CHUNKING_BASE_URL` defaults to
`EMBEDDINGS_BASE_URL`; pick a light model (`phi3:minimal`, `qwen2.5:0.5b`, …)
since it is called once per chunk at index time. When the LLM is unreachable,
the chunk is embedded raw so indexing never fails.

> Note — enabling contextual chunking changes embeddings, so **re-run a scan**
> (`rag_reindex` / `/admin/reindex`) for previously indexed KBs to benefit.

## Storage backends

Two backends implement the same `Store` interface. SQLite is the default and
runs standalone; PostgreSQL is opt-in.

### SQLite (default)

A single file (`DB_PATH`) with FTS5 full-text search. No database server
required — nothing else to start.

### PostgreSQL (pgvector)

Opt-in for deployments that prefer a server-side store. Embeds the pgvector
extension (vector column + `ts_rank` full-text search). Point the server at a
reachable Postgres with the `vector` extension:

```bash
STORE_BACKEND=postgres \
DATABASE_URL=postgres://raghub:raghub@localhost:5432/raghub \
node dist/index.js
```

The schema and the `vector` extension are created idempotently on first
connect. Set `EMBEDDINGS_DIMENSION` to match your model before ingesting —
the column is sized once at migration time.

> Tests : the PostgreSQL backend is exercised without any server via **PGlite**,
> a real Postgres engine compiled to WASM with the pgvector extension bundled,
> instantiated in-memory for the duration of the suite (see `src/test/e2e/pgstore.e2e.test.ts`).

## Transport modes

- **stdio** (default): serve MCP tools on stdin/stdout for a local agent. No scan loop, no REST.
- **http** (`--http` / `RAG_TRANSPORT=http`): REST API + streamable-http MCP on `PORT`.

In stdio mode, logs go to stderr (stdout is reserved for JSON-RPC); there is no periodic scan.

## Scan behavior

- **Skipped vs excluded** — the scan tally (`+added ~modified -deleted =skipped xexcluded`)
  distinguishes files that are unchanged (`skipped`) from files that were scanned but
  not indexed because they have no extractable text (`excluded`, i.e. binary or empty).
  Run with `LOG_LEVEL=debug` to see the per-file reason.
- **Self-healing vectors** — if the embeddings endpoint is down during a scan, chunks
  are stored without a vector. On the next scan any file with null-vector chunks is
  automatically re-indexed (content unchanged is not enough to skip it), so no manual
  table wipe is needed to recover. The scan log reports these as
  `re-indexing (null embeddings)`.
