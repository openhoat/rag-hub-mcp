---
status: accepted
---

# Single process with an in-process indexing worker

The whole system — transport, search, and the indexing worker — runs in one
process. Indexing is asynchronous (see ADR-0003), but the consumer is a loop
started inside the same process rather than a separate service. We chose this to
keep deployment to a single binary with no queue or worker to operate. The cost
is that indexing does not scale horizontally.

## Consequences

- Scaling indexing beyond one machine requires extracting the worker into a
  separate consumer of the `jobs` table.
