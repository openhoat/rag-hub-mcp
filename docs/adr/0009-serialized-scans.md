---
status: accepted
---

# One scan at a time, coalesced

A scan walks the KB root, compares each file to the `files` table and, at the
end, deletes every row it did not see again (`cleanupStale`). The scan is
triggered from four places in the same process: the startup scan, the periodic
timer, `POST /admin/reindex` and the `rag_reindex` tool. Nothing serialized
them, so two overlapping walks started from two `knownFiles` snapshots and
each treated the rows the other had just written as stale: a document could be
deleted (chunks included) right after being indexed, or deleted while its job
was still running.

Scans now share a single in-flight slot. A scan requested while one is running
is coalesced onto it and returns the same result; a forced reindex, which must
keep its purge, drains the running scan instead of coalescing.

## Consequences

- Concurrent triggers cost one walk and one `IngestResult`, not two walks that
  fight over the `files` table.
- A coalesced caller can see a result computed before its own request finished
  arriving; that is the point, and it is logged (`scan: coalescing onto the
in-flight scan`).
- `forceReindex` always purges after the in-flight scan settles, never before.
  Coalescing it would silently downgrade it to a plain scan.
- The timer keeps its `SCAN_INTERVAL` cadence: a tick that lands on a running
  scan is dropped instead of queued, so scans cannot pile up behind a slow
  filesystem.
- Document writes (`addDocument`, `deleteDocument`, `deleteKb`) do not take the
  slot yet. A scan that started before such a write can still delete the row it
  created; the window is narrow and left open deliberately, to keep this change
  about scan-to-scan interference.
