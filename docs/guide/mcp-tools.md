# MCP tools

`rag-hub-mcp` exposes 9 tools over the Model Context Protocol. Any MCP-compatible agent (opencode, Claude Code, Cline…) can call them.

| Tool | Description |
| --- | --- |
| `rag_list_kbs` | List knowledge bases with stats |
| `rag_list_documents` | List documents in a KB |
| `rag_search` | Search KBs (`kb` optional — omitting searches all) |
| `rag_add_document` | Add a text document (creates folder if needed) |
| `rag_read` | Retrieve the full extracted content of a document (KB + path) |
| `rag_delete_document` | Delete a document |
| `rag_delete_kb` | Delete an entire KB |
| `rag_reindex` | Trigger an immediate scan |
| `rag_status` | Index overview (KBs, documents, chunks) |

## Example calls

```json
{
  "name": "rag_list_kbs",
  "arguments": {}
}
// → 3 KBs, 42 documents, 128 chunks
```

```json
{
  "name": "rag_search",
  "arguments": { "query": "how to set up SSO", "kb": "infra", "top_k": 10 }
}
// → ranked chunks with source citations
```

```json
{
  "name": "rag_add_document",
  "arguments": { "kb": "dev", "path": "notes/setup.md", "content": "# Setup\n…" }
}
// → added + indexed
```

## `rag_search`

- `query` (required): natural-language search query.
- `kb` (optional): restrict to one knowledge base.
- `top_k` (optional, default 10): number of results.

## `rag_add_document`

- `kb` (required): knowledge base name; the folder is created if needed.
- `path` (required): relative path in the KB (e.g. `notes/architecture.md`).
- `content` (required): text or Markdown content.

The document is extracted, chunked, embedded and indexed immediately.
