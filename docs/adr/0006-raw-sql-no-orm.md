---
status: accepted
---

# Raw SQL, no ORM

Storage uses raw SQL through `better-sqlite3` and `pg` rather than an ORM. This
is deliberate: the schema relies on backend-specific features (SQLite FTS5,
pgvector, `FOR UPDATE SKIP LOCKED`) that an ORM would hide or complicate, and the
two backends share one hand-written `Store`/`JobQueue` interface. Raw SQL keeps
those features explicit and avoids a layer whose abstraction would leak.

## Consequences

- Backend-specific SQL is normalised at the store boundary, not by an ORM.
- Migrations are hand-written and idempotent (`CREATE TABLE IF NOT EXISTS`).
