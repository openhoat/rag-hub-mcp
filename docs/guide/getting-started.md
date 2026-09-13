# Getting started

`rag-hub-mcp` is a self-hosted RAG server. It turns folders of documents into named knowledge bases, then exposes them to AI agents over [MCP](https://modelcontextprotocol.io/) and to any tool over a small REST API.

Requires **Node 22+**. `better-sqlite3` compiles natively on first use (prebuilt binaries are used when available).

## Quick start (stdio)

Run it directly with `npx` — no install, no server to keep running:

```bash
npx rag-hub-mcp
```

stdio mode serves the MCP tools on stdin/stdout for a local agent. Point it at a folder of documents:

```bash
mkdir -p ./kbs/my-knowledge-base
echo "Hello RAG" > ./kbs/my-knowledge-base/hello.md
npx rag-hub-mcp
```

Or install globally once:

```bash
npm install -g rag-hub-mcp
rag-hub-mcp          # stdio
rag-hub-mcp --http   # server
```

## Quick start (HTTP server)

For a shared server reachable over the network (REST API + MCP over streamable-http) or a Docker deployment:

```bash
mkdir -p ./kbs/my-knowledge-base
echo "Hello RAG" > ./kbs/my-knowledge-base/hello.md

MCP_API_KEY=my-secret-key \
EMBEDDINGS_BASE_URL=http://localhost:11434/v1 \
KB_ROOT=./kbs \
npx rag-hub-mcp --http
```

Verify:

```bash
curl http://localhost:8000/health
curl -H "Authorization: Bearer my-secret-key" http://localhost:8000/admin/kbs
```

### Docker

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

The image is multi-arch (`linux/amd64`, `linux/arm64`). Or build it yourself:

```bash
docker build -t rag-hub-mcp .
```

## Next steps

- [Architecture](architecture) — how indexing and search work.
- [MCP Tools](mcp-tools) — the 9 tools your agents get.
- [REST API](rest-api) — the `/search` and `/admin/*` endpoints.
- [Configuration](configuration) — environment variables and embedding models.
- [Integrations](integrations) — wire up opencode, Claude Code, Cline, dsh.
- [End-to-end example](end-to-end) — drive a KB entirely from a chat.
