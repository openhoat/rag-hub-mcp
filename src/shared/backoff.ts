/**
 * Exponential backoff for indexer retries: `base * 2^(attempts-1)`, capped at
 * `maxMs`. `attempts` is the 1-based attempt number that just failed (so the
 * first retry waits `base`). Returns 0 when `baseMs <= 0` (backoff disabled).
 *
 * Backend-neutral helper shared by the SQLite and PostgreSQL job queues so the
 * schedule is identical on both.
 */
export const retryBackoffMs = (attempts: number, baseMs: number, maxMs: number): number => {
  if (baseMs <= 0) return 0
  const exp = Math.max(0, attempts - 1)
  return Math.min(maxMs, baseMs * 2 ** exp)
}
