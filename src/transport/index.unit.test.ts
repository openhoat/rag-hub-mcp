import { describe, expect, test } from 'vitest'
import { requireHttpApiKey } from '../config.js'

describe('requireHttpApiKey', () => {
  test('accepts a configured key in http mode', () => {
    expect(requireHttpApiKey(true, 'secret')).toBe(true)
  })

  test('rejects an empty key in http mode', () => {
    expect(requireHttpApiKey(true, '')).toBe(false)
  })

  test('rejects a whitespace-only key in http mode', () => {
    expect(requireHttpApiKey(true, '   ')).toBe(false)
  })

  test('does not block stdio mode without a key', () => {
    expect(requireHttpApiKey(false, '')).toBe(true)
  })

  test('does not block stdio mode with a key', () => {
    expect(requireHttpApiKey(false, 'secret')).toBe(true)
  })
})
