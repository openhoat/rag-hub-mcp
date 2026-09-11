# Integrations

## opencode / Claude Code / Cline — local (stdio)

Use `npx` to launch the server on demand. No server to keep running; set `KB_ROOT` and `DB_PATH` via `env`.

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

## opencode / Claude Code / Cline — remote (HTTP)

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

## dsh

Install the community plugin **dsh-mcp-manager** from the marketplace, then configure it with URL `http://rag-hub-mcp:8000/mcp` and a Bearer token.
