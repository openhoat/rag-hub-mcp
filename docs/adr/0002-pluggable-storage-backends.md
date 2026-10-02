---
status: accepted
---

# Pluggable storage backends behind one Store interface

Two backends implement the same `Store` and `JobQueue` interfaces, selected by
`STORE_BACKEND`: SQLite + FTS5 (default, a self-contained single file) and
PostgreSQL + pgvector (opt-in). One interface keeps the search and indexing
modules backend-neutral, so the default stays zero-infra while a server backend
remains available without forking callers.

## Consequences

- The interface is the contract; backend-specific behaviour (FTS5 rank versus
  `ts_rank`, BLOB versus `vector` column) is normalised at the store boundary.
- Any new backend must satisfy the full interface.
