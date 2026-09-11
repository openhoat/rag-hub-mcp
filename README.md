# rag-hub-mcp

[![CI](https://github.com/openhoat/rag-hub-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/openhoat/rag-hub-mcp/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/rag-hub-mcp)](https://www.npmjs.com/package/rag-hub-mcp)
[![npm downloads](https://img.shields.io/npm/dm/rag-hub-mcp)](https://www.npmjs.com/package/rag-hub-mcp)
[![GitHub stars](https://img.shields.io/github/stars/openhoat/rag-hub-mcp)](https://github.com/openhoat/rag-hub-mcp)
[![last commit](https://img.shields.io/github/last-commit/openhoat/rag-hub-mcp)](https://github.com/openhoat/rag-hub-mcp)

**Self-hosted RAG server. Knowledge bases from folders, exposed via MCP + REST.**

Drop documents into folders → each folder becomes a named knowledge base → search them from any MCP-compatible agent (Claude Code, OpenCode…) or REST API.

## Install

There is no install — run it directly with `npx`:

```bash
# stdio mode (default): serve MCP tools on stdin/stdout for a local agent
npx rag-hub-mcp

# HTTP mode: REST API + MCP (streamable-http) on a port
npx rag-hub-mcp --http
```

Or install it globally once:

```bash
npm install -g rag-hub-mcp
rag-hub-mcp          # stdio
rag-hub-mcp --http   # server
```

Requires **Node 20+**. `better-sqlite3` compiles natively on first use (prebuilt binaries are used when available).

## Features

- **Folders are knowledge bases** — 1st level = 1 KB, named after the folder
- **MCP server** — 8 tools for search, list, add, delete, reindex
- **REST API** — `/search`, `/admin/kbs`, `/admin/reindex`
- **OpenAI-compatible embeddings** — works with Ollama, Bifrost, OpenAI, LM Studio…
- **Hybrid search** — vector (cosine similarity) + keyword (SQLite FTS5), fused by weighted sum
- **Incremental indexing** — polls `KB_ROOT` for new/changed/deleted files, compute SHA-256 diff
- **Document formats** — md/txt/html/code, PDF, DOCX, XLSX, PPTX (basic text)
- **Auth** — Bearer token via `MCP_API_KEY`, no UI

## Quick start (stdio)

Create a local knowledge base folder and drop documents in it, then launch the stdio server where your agent can see it:

```bash
mkdir -p ./kbs/my-knowledge-base
echo "Hello RAG" > ./kbs/my-knowledge-base/hello.md

# stdio mode reads KB_ROOT (./kbs) and DB_PATH (./rag.db) from the env of the MCP client.
# Configure it below in your agent's mcpServers, or set the env vars when you run it:
npx rag-hub-mcp
```

### Point your agent at it

Any MCP-compatible agent (Claude Code, OpenCode, Cline…) can launch the server itself via `npx` — no server to keep running:

```json
{
  "mcpServers": {
    "rag-hub-mcp": {
      "command": "npx",
      "args": ["rag-hub-mcp"],
      "env": {
        "EMBEDDINGS_BASE_URL": "http://localhost:11434/v1",
        "EMBEDDINGS_MODEL": "bge-m3",
        "KB_ROOT": "./kbs",
        "DB_PATH": "./rag.db"
      }
    }
  }
}
```

The 8 `rag_*` tools are then available in your agent sessions.

## Quick start (HTTP server)

For a shared server reachable over the network (REST API + MCP over HTTP) or a Docker deployment:

```bash
mkdir -p ./kbs/my-knowledge-base
echo "Hello RAG" > ./kbs/my-knowledge-base/hello.md

MCP_API_KEY=my-secret-key \
EMBEDDINGS_BASE_URL=http://localhost:11434/v1 \
KB_ROOT=./kbs \
npx rag-hub-mcp --http
```

```bash
# Verify
curl http://localhost:8000/health
# List KBs
curl -H "Authorization: Bearer my-secret-key" http://localhost:8000/admin/kbs
```

Or with Docker:

```bash
docker run -d --name rag-hub-mcp \
  -p 8000:8000 \
  -e MCP_API_KEY=my-secret-key \
  -e EMBEDDINGS_BASE_URL=http://host.docker.internal:11434/v1 \
  -e KB_ROOT=/data/kbs \
  -v ./kbs:/data/kbs \
  -v rag-hub-data:/data/index \
  ghcr.io/openhoat/rag-hub-mcp:latest
```

## MCP tools

| Tool | Description |
|---|---|
| `rag_list_kbs` | List knowledge bases with stats |
| `rag_list_documents` | List documents in a KB |
| `rag_search` | Search KBs (`kb` optional — omits searches all) |
| `rag_add_document` | Add a text document (creates folder if needed) |
| `rag_delete_document` | Delete a document |
| `rag_delete_kb` | Delete an entire KB |
| `rag_reindex` | Trigger an immediate scan |
| `rag_status` | Index overview |

### Example MCP calls

```
rag_list_kbs → 3 KBs, 42 documents, 128 chunks
rag_search(query="how to set up SSO", kb="infra") → results with source citations
rag_add_document(kb="dev", path="notes/setup.md", content="# Setup\n…") → added + indexed
```

## REST API

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | — | Health check |
| `/admin/kbs` | GET | Bearer | List KBs |
| `/admin/kbs/:kb/documents` | GET | Bearer | List documents |
| `/admin/kbs/:kb/documents` | POST | Bearer | Add document (json: `{path, content}`) |
| `/admin/kbs/:kb/documents/*` | DELETE | Bearer | Delete document |
| `/admin/kbs/:kb` | DELETE | Bearer | Delete KB |
| `/admin/reindex` | POST | Bearer | Force reindex |
| `/admin/status` | GET | Bearer | Status |
| `/search?query=...&kb=...&top_k=10` | GET | Bearer | Search |

## Configuration

| Variable | Default | Description |
|---|---|---|
| `MCP_API_KEY` | _(required in HTTP)_ | Bearer token for REST endpoints. Ignored in stdio mode |
| `EMBEDDINGS_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible `/v1/embeddings` endpoint |
| `EMBEDDINGS_API_KEY` | _(none)_ | Bearer token for the embeddings API |
| `EMBEDDINGS_MODEL` | `bge-m3` | Embedding model name |
| `KB_ROOT` | `./kbs` (stdio) / `/data/kbs` (http) | Root directory for knowledge base folders |
| `SCAN_INTERVAL` | `300` | Scan interval in seconds (0 = disabled). HTTP mode only |
| `PORT` | `8000` | HTTP listen port. HTTP mode only |
| `DB_PATH` | `./rag.db` (stdio) / `/data/index/rag.db` (http) | SQLite database path |
| `RAG_TRANSPORT` | `stdio` | `stdio` or `http`. `--http` flag wins |

### Recommended embedding models

- **bge-m3** — multilingual (FR/EN), 1024d, best retrieval, CPU-friendly
- nomic-embed-text — lighter, English-focused
- text-embedding-3-small — OpenAI API

## Integration

### OpenCode / Claude Code / Cline — local (stdio)

`npx` launches the server on demand. No server to keep running; set `KB_ROOT` and `DB_PATH` via `env`:

```json
{
  "mcpServers": {
    "rag-hub-mcp": {
      "command": "npx",
      "args": ["rag-hub-mcp"],
      "env": {
        "EMBEDDINGS_BASE_URL": "http://localhost:11434/v1",
        "KB_ROOT": "./kbs",
        "DB_PATH": "./rag.db"
      }
    }
  }
}
```

### OpenCode / Claude Code / Cline — remote (HTTP)

Against a server running `rag-hub-mcp --http`:

```json
{
  "mcpServers": {
    "rag-hub-mcp": {
      "type": "remote",
      "url": "http://localhost:8000/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_API_KEY>"
      }
    }
  }
}
```

### dsh

Install the community plugin **dsh-mcp-manager** from the marketplace → configure with URL `http://rag-hub-mcp:8000/mcp` + Bearer.

## End-to-end example with Claude Code

Wire any MCP-capable agent to rag-hub-mcp, then drive everything — creating a KB, adding documents, and querying them — directly from your chat prompts. This example uses **Claude Code**, but it works the same with OpenCode, Cline, or any client exposing MCP tools.

### 1. Point the agent at the server

Add the MCP server to Claude Code's config (`~/.claude.json` or project `.mcp.json`). Using `npx`, the server starts on demand in stdio mode — no server to keep running:

```json
{
  "mcpServers": {
    "rag-hub-mcp": {
      "command": "npx",
      "args": ["rag-hub-mcp"],
      "env": {
        "EMBEDDINGS_BASE_URL": "http://localhost:11434/v1",
        "KB_ROOT": "./kbs",
        "DB_PATH": "./rag.db"
      }
    }
  }
}
```

Restart the agent. The 8 `rag_*` tools (`rag_list_kbs`, `rag_add_document`, `rag_search`, …) are now available to your sessions.

### 2. Create a KB and add documents (via the agent)

```text
> Using the rag-hub-mcp MCP tools, create a knowledge base called "infra"
  and add a document to it explaining how SSO authentication is set up.
```

The agent calls `rag_add_document(kb="infra", path="sso.md", content="# SSO setup\n…")`.
The KB folder is created on the fly and the document is extracted, embedded and indexed.

```text
> Also add a second document "network.md" about the DNS topology.
```

Now `infra` holds two documents and is ready to answer questions.

### 3. Query the index through your agent

```text
> Using the rag-hub-mcp MCP tools, tell me: what is the DNS topology
  and how is SSO authentication configured?
```

The agent calls `rag_search(query="…", kb="infra")`, pulls the matching chunks with source citations, and answers from the indexed content — no need to browse the files yourself.

### 4. Check what's stored

```text
> List the knowledge bases and the documents inside "infra".
```

This runs `rag_list_kbs` and `rag_list_documents(kb="infra")`, so you always know what has been indexed and when.

> Tip: the same flow works headlessly via the [REST API](#rest-api) if you prefer `curl` over an agent.

## Development

```bash
npm install
npm run qa          # lint + typecheck + test
npm run validate    # qa + build
npm start           # start the server
```

Uses **Biome** for linting/formatting and **vitest** for unit tests.

## License

MIT