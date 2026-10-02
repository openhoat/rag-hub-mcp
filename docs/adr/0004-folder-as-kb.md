---
status: accepted
---

# A first-level folder is a knowledge base

The knowledge base model is the filesystem: each first-level folder under the
root directory is one KB, named after the folder, and documents are the files
inside it. The folder is the source of truth even though documents can also be
added through the MCP/REST tools, which simply write into it. We chose the folder
as the canonical model because it makes a KB something a user can inspect, back
up, and edit with plain tools, with no hidden state to reconcile.

## Consequences

- `rag_add_document` / `rag_delete_document` manipulate files under the folder;
  they never bypass it.
- Removing a folder removes the KB; the store mirrors what the scan sees.
