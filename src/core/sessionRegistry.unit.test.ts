import { describe, expect, test, vi } from 'vitest'
import { SessionRegistry } from './sessionRegistry.js'

const makeRegistry = (overrides: { maxSessions?: number; ttlMs?: number; now?: () => number } = {}) => {
  const { maxSessions = 2, ttlMs = 30_000, now = vi.fn(() => 1_000) } = overrides
  return { registry: new SessionRegistry<string>(maxSessions, ttlMs, now), now }
}

describe('SessionRegistry', () => {
  test('should set and retrieve sessions with a last-active timestamp', () => {
    const { registry, now } = makeRegistry()
    expect(registry.set('a', 'A')).toBe(true)
    const entry = registry.get('a')
    expect(entry?.value).toBe('A')
    expect(entry?.lastActive).toBe(now())
    expect(registry.size()).toBe(1)
  })

  test('should be idempotent when re-setting an existing id', () => {
    const { registry } = makeRegistry()
    registry.set('a', 'A')
    expect(registry.set('a', 'A')).toBe(true)
    expect(registry.size()).toBe(1)
  })

  test('should refuse a new session when at max capacity', () => {
    const { registry } = makeRegistry({ maxSessions: 2 })
    expect(registry.set('a', 'A')).toBe(true)
    expect(registry.set('b', 'B')).toBe(true)
    expect(registry.set('c', 'C')).toBe(false)
    expect(registry.size()).toBe(2)
  })

  test('should reject a rejected capacity check', () => {
    const { registry } = makeRegistry({ maxSessions: 1 })
    registry.set('a', 'A')
    expect(registry.hasCapacity()).toBe(false)
  })

  test('should touch refresh the last-active timestamp of an existing session', () => {
    const { registry, now } = makeRegistry()
    registry.set('a', 'A')
    ;(now as ReturnType<typeof vi.fn>).mockReturnValue(5_000)
    expect(registry.touch('a')).toBe(true)
    expect(registry.get('a')?.lastActive).toBe(5_000)
  })

  test('should touch return false for a missing session', () => {
    const { registry } = makeRegistry()
    expect(registry.touch('missing')).toBe(false)
  })

  test('should purge only sessions idle beyond the TTL', () => {
    const { registry, now } = makeRegistry({ ttlMs: 1_000 })
    registry.set('old', 'old')
    ;(now as ReturnType<typeof vi.fn>).mockReturnValue(1_100)
    registry.set('recent', 'recent')
    ;(now as ReturnType<typeof vi.fn>).mockReturnValue(2_100)
    const expired = registry.purgeExpired()
    expect(expired).toEqual(['old'])
    expect(registry.has('old')).toBe(false)
    expect(registry.has('recent')).toBe(true)
  })

  test('should delete a session', () => {
    const { registry } = makeRegistry()
    registry.set('a', 'A')
    expect(registry.delete('a')).toBe(true)
    expect(registry.has('a')).toBe(false)
    expect(registry.delete('a')).toBe(false)
  })
})
