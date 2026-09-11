# REST API

All endpoints except `/health` require a Bearer token (`MCP_API_KEY`). `rag-hub-mcp --http` serves the REST API alongside the streamable-http MCP endpoint.

## Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | — | Health check |
| `/admin/kbs` | GET | Bearer | List KBs |
| `/admin/kbs/:kb/documents` | GET | Bearer | List documents |
| `/admin/kbs/:kb/documents` | POST | Bearer | Add document (`json: {path, content}`) |
| `/admin/kbs/:kb/documents/*` | DELETE | Bearer | Delete document |
| `/admin/kbs/:kb` | DELETE | Bearer | Delete KB |
| `/admin/reindex` | POST | Bearer | Force reindex |
| `/admin/status` | GET | Bearer | Index status |
| `/search?query=...&kb=...&top_k=10` | GET | Bearer | Search |

## Examples

```bash
# Health check (no auth)
curl http://localhost:8000/health

# List KBs
curl -H "Authorization: Bearer my-secret-key" http://localhost:8000/admin/kbs

# Search (all KBs)
curl -G -H "Authorization: Bearer my-secret-key" \
  --data-urlencode "query=how to set up SSO" \
  --data-urlencode "top_k=10" \
  http://localhost:8000/search

# Add a document
curl -X POST -H "Authorization: Bearer my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"path": "notes/setup.md", "content": "# Setup\n…"}' \
  http://localhost:8000/admin/kbs/dev/documents
```

## MCP over HTTP

The streamable-http MCP endpoint is served at `/mcp`, protected by the same Bearer token. Configure your agent with:

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
