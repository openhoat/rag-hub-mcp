---
status: accepted
---

# Asynchronous indexing via a job queue

Indexing is split into a producer (filesystem scan, then enqueue) and a worker
consumer (extract, chunk, embed, insert), mediated by a `jobs` table. Scanning
and hashing is cheap and runs often; extraction and embedding is expensive and
must survive provider outages and retries. The split keeps a slow embed from
blocking the scan.

## Consequences

- Jobs are durable; failed jobs park after `INDEXER_RETRY_MAX` and need a manual
  retry.
- The worker polls every second and claims up to `INDEXER_CONCURRENCY` jobs.
