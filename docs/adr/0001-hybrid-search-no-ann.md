---
status: accepted
---

# Hybrid search without an ANN index

Search fuses vector cosine similarity with full-text keyword scores. Vector
retrieval loads every chunk into memory and computes brute-force cosine in
JavaScript; there is no ANN index and no vector database. This is deliberate: a
single self-contained SQLite file keeps the project at zero infrastructure, and
corpus sizes stay small enough that brute-force is fast. pgvector is wired for
the PostgreSQL backend (schema and column) but the search path does not use its
`<=>` operator.

## Consequences

- Retrieval cost scales linearly with chunk count.
- Adding an ANN index later (sqlite-vec or pgvector HNSW) is a bounded change
  behind the `Store` interface.
