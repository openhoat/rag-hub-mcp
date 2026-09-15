/**
 * A lightweight bounded store of named sessions, each tracked with a last-active
 * timestamp.
 *
 * - `maxSessions` caps how many sessions may coexist. `set()` refuses new entries
 *   once the cap is reached (returns a `rejected` signal) instead of evicting an
 *   arbitrary active session: rejecting is an explicit, safe signal for the
 *   caller (which responds with a 503), and avoids silently dropping an active
 *   client. The caller decides how to react to a rejected insert.
 * - `ttlMs` lets `purgeExpired()` drop sessions idle beyond the threshold.
 *
 * `now()` is injectable so unit tests can drive TTL eviction deterministically
 * without fake timers.
 */
export class SessionRegistry<V> {
  private readonly sessions = new Map<string, { lastActive: number; value: V }>()
  private readonly now: () => number

  constructor(
    private readonly maxSessions: number,
    private readonly ttlMs: number,
    now: () => number = Date.now,
  ) {
    this.now = now
  }

  size = (): number => this.sessions.size

  get = (sessionId: string): { lastActive: number; value: V } | undefined => this.sessions.get(sessionId)

  has = (sessionId: string): boolean => this.sessions.has(sessionId)

  /** True when a new session may be inserted without exceeding `maxSessions`. */
  hasCapacity = (): boolean => this.sessions.size < this.maxSessions

  /** Refresh the activity timestamp of an existing session. Returns false if absent. */
  touch = (sessionId: string): boolean => {
    const entry = this.sessions.get(sessionId)
    if (!entry) return false
    entry.lastActive = this.now()
    return true
  }

  /**
   * Insert a session. Returns `true` when added (idempotent for an existing id),
   * `false` when the registry is at capacity (`maxSessions`) and the entry was
   * rejected.
   */
  set = (sessionId: string, value: V): boolean => {
    if (this.sessions.has(sessionId)) return true
    if (this.sessions.size >= this.maxSessions) return false
    this.sessions.set(sessionId, { lastActive: this.now(), value })
    return true
  }

  delete = (sessionId: string): boolean => this.sessions.delete(sessionId)

  /** Remove and return the ids of sessions idle longer than `ttlMs`. */
  purgeExpired = (): string[] => {
    const cutoff = this.now() - this.ttlMs
    const expired: string[] = []
    for (const [id, entry] of this.sessions) {
      if (entry.lastActive < cutoff) expired.push(id)
    }
    for (const id of expired) this.sessions.delete(id)
    return expired
  }
}
