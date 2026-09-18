# MCP tools

`rag-hub-mcp` exposes 10 tools over the Model Context Protocol. Any MCP-compatible agent (opencode, Claude Code, Cline…) can call them.

| Tool                  | Description                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `rag_list_kbs`        | List knowledge bases with stats                                                                    |
| `rag_list_documents`  | List documents in a KB                                                                             |
| `rag_search`          | Search KBs (`kb` optional — omitting searches all). Write a self-contained query with full context |
| `rag_add_document`    | Add a text document (creates folder if needed)                                                     |
| `rag_read`            | Retrieve the full extracted content of a document (KB + path)                                      |
| `rag_delete_document` | Delete a document                                                                                  |
| `rag_delete_kb`       | Delete an entire KB                                                                                |
| `rag_reindex`         | Scan for changes (`force: true` rebuilds from scratch) — enqueues jobs, returns counts             |
| `rag_status`          | Index overview (KBs, documents, chunks) + queue stats                                              |
| `rag_jobs`            | Indexing queue status (pending/processing/failed) and recent failures                              |

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
  "arguments": {
    "kb": "dev",
    "path": "notes/setup.md",
    "content": "# Setup\n…"
  }
}
// → added + queued for indexing
```

## `rag_search`

- `query` (required): natural-language search query. **Write it self-contained with
  full context** (e.g. "API v2 rate limits", not "the other version") — the server is
  stateless, so follow-up references from the conversation are resolved client-side
  before the call.
- `kb` (optional): restrict to one knowledge base.
- `top_k` (optional, default 10): number of results.

## `rag_add_document`

- `kb` (required): knowledge base name; the folder is created if needed.
- `path` (required): relative path in the KB (e.g. `notes/architecture.md`).
- `content` (required): text or Markdown content.

The document is queued for indexing and processed asynchronously by the worker (extract → chunk → embed → insert). Use `rag_jobs` to check progress.

## `rag_reindex`

- `force` (optional, default `false`): trigger a **full rebuild** instead of an
  incremental scan. When `true`, all chunks and files are purged from the index
  (KB folders are kept), then every document is re-queued for indexing. Use it
  after enabling [contextual chunking](./configuration#contextual-chunking)
  or changing an indexing option, so previously indexed documents pick up the new
  embeddings. Without `force` (or when the argument is omitted) it is a plain
  incremental scan — unchanged files are skipped, new/modified files are enqueued.

The scan returns added/modified/deleted/skipped/excluded counts. Actual indexing happens asynchronously in the worker — results appear once the worker has processed the enqueued jobs.

## `rag_jobs`

Queue status without arguments.

```text
Queue: 2 pending, 1 processing, 0 failed
```

Failed jobs are parked after `INDEXER_RETRY_MAX` attempts. Retry them manually via the REST API (`POST /admin/jobs/:id/retry`).
