# End-to-end example

Wire any MCP-capable agent to `rag-hub-mcp`, then drive everything — creating a KB, adding documents, and querying them — directly from your chat prompts. This example uses **Claude Code**, but it works the same with opencode, Cline, or any client exposing MCP tools.

## 1. Point the agent at the server

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

## 2. Create a KB and add documents (via the agent)

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

## 3. Query the index through your agent

```text
> Using the rag-hub-mcp MCP tools, tell me: what is the DNS topology
  and how is SSO authentication configured?
```

The agent calls `rag_search(query="…", kb="infra")`, pulls the matching chunks with source citations, and answers from the indexed content — no need to browse the files yourself.

## 4. Check what's stored

```text
> List the knowledge bases and the documents inside "infra".
```

This runs `rag_list_kbs` and `rag_list_documents(kb="infra")`, so you always know what has been indexed and when.

> Tip: the same flow works headlessly via the [REST API](rest-api) if you prefer `curl` over an agent.
