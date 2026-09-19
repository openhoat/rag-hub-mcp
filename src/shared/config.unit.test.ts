import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ENV_KEYS } from './config.js'

const ARGV_SAVE = process.argv

// config.ts parses the env schema at module load, so each case re-imports it
// with a controlled process.env + argv to observe the resolved defaults.
// The schema is introspected via ENV_KEYS so every variable is isolated before
// a case runs, keeping the defaults independent of the ambient environment.
const importConfig = async () => {
  vi.resetModules()
  return await import('./config.js')
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
})

afterEach(() => {
  vi.resetModules()
  process.argv = [...ARGV_SAVE]
})

describe('config', () => {
  test('applies cwd-relative defaults in stdio mode when unset', async () => {
    const { env } = await importConfig()
    expect(env.KB_ROOT).toBe('./kbs')
    expect(env.DB_PATH).toBe('./rag.db')
    expect(env.PORT).toBe(8000)
    expect(env.SCAN_INTERVAL).toBe(300)
  })

  test('keeps existing env values in stdio mode', async () => {
    process.env.KB_ROOT = '/custom/kbs'
    process.env.DB_PATH = '/custom/rag.db'
    process.env.PORT = '9000'
    const { env } = await importConfig()
    expect(env.KB_ROOT).toBe('/custom/kbs')
    expect(env.DB_PATH).toBe('/custom/rag.db')
    expect(env.PORT).toBe(9000)
  })

  test('applies container paths in http mode via argv flag', async () => {
    process.argv = [...ARGV_SAVE, '--http']
    const { env } = await importConfig()
    expect(env.KB_ROOT).toBe('/data/kbs')
    expect(env.DB_PATH).toBe('/data/index/rag.db')
  })

  test('applies container paths in http mode via RAG_TRANSPORT', async () => {
    process.env.RAG_TRANSPORT = 'http'
    const { env } = await importConfig()
    expect(env.KB_ROOT).toBe('/data/kbs')
    expect(env.DB_PATH).toBe('/data/index/rag.db')
  })

  test('coerces numeric env values', async () => {
    process.env.PORT = '8080'
    process.env.SCAN_INTERVAL = '60'
    process.env.MCP_SESSION_MAX = '42'
    const { env } = await importConfig()
    expect(env.PORT).toBe(8080)
    expect(env.SCAN_INTERVAL).toBe(60)
    expect(env.MCP_SESSION_MAX).toBe(42)
  })

  test('defaults NODE_ENV to production and coerces log level', async () => {
    const { env } = await importConfig()
    expect(env.NODE_ENV).toBe('production')
    expect(env.LOG_LEVEL).toBe('info')
  })

  test('honors explicit NODE_ENV', async () => {
    process.env.NODE_ENV = 'development'
    const { env } = await importConfig()
    expect(env.NODE_ENV).toBe('development')
  })

  test('corsOrigins parses a comma-separated string', async () => {
    process.env.CORS_ORIGINS = ' https://a.com , https://b.io '
    const { corsOrigins } = await importConfig()
    expect(corsOrigins).toEqual(['https://a.com', 'https://b.io'])
  })

  test('extraTextExtensions parses a comma-separated string into a normalized set', async () => {
    process.env.TEXT_EXTENSIONS = ' .kt, .Java , ,go '
    const { extraTextExtensions } = await importConfig()
    expect([...extraTextExtensions]).toEqual(['.kt', '.java', '.go'])
  })

  test('extraTextExtensions defaults to an empty set', async () => {
    const { extraTextExtensions } = await importConfig()
    expect(extraTextExtensions.size).toBe(0)
  })

  test('contextual chunking defaults to disabled', async () => {
    const { env } = await importConfig()
    expect(env.CONTEXTUAL_CHUNKING_ENABLED).toBe(false)
    expect(env.CONTEXTUAL_CHUNKING_MODEL).toBeUndefined()
  })

  test('contextual chunking parses the enable flag', async () => {
    process.env.CONTEXTUAL_CHUNKING_ENABLED = 'true'
    process.env.CONTEXTUAL_CHUNKING_MODEL = 'qwen2.5:0.5b'
    const { env } = await importConfig()
    expect(env.CONTEXTUAL_CHUNKING_ENABLED).toBe(true)
    expect(env.CONTEXTUAL_CHUNKING_MODEL).toBe('qwen2.5:0.5b')
  })
})

describe('requireHttpApiKey', () => {
  test('accepts a configured key in http mode', async () => {
    const { requireHttpApiKey } = await importConfig()
    expect(requireHttpApiKey(true, 'secret')).toBe(true)
  })

  test('rejects an empty key in http mode', async () => {
    const { requireHttpApiKey } = await importConfig()
    expect(requireHttpApiKey(true, '')).toBe(false)
  })

  test('rejects a whitespace-only key in http mode', async () => {
    const { requireHttpApiKey } = await importConfig()
    expect(requireHttpApiKey(true, '   ')).toBe(false)
  })

  test('does not block stdio mode without a key', async () => {
    const { requireHttpApiKey } = await importConfig()
    expect(requireHttpApiKey(false, '')).toBe(true)
  })

  test('does not block stdio mode with a key', async () => {
    const { requireHttpApiKey } = await importConfig()
    expect(requireHttpApiKey(false, 'secret')).toBe(true)
  })
})
