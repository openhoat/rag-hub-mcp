import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const ARGV_SAVE = process.argv

// preload.ts sets KB_ROOT / DB_PATH defaults at import time depending on the
// transport mode, so each case must re-import it with a controlled env.
async function importPreload() {
  vi.resetModules()
  await import('./preload.js')
  return { kbRoot: process.env.KB_ROOT, dbPath: process.env.DB_PATH }
}

beforeEach(() => {
  delete process.env.KB_ROOT
  delete process.env.DB_PATH
  delete process.env.RAG_TRANSPORT
})

afterEach(() => {
  vi.resetModules()
  process.argv = [...ARGV_SAVE]
})

describe('preload', () => {
  test('applies cwd-relative defaults in stdio mode when unset', async () => {
    const { kbRoot, dbPath } = await importPreload()
    expect(kbRoot).toBe('./kbs')
    expect(dbPath).toBe('./rag.db')
  })

  test('keeps existing env values in stdio mode', async () => {
    process.env.KB_ROOT = '/custom/kbs'
    process.env.DB_PATH = '/custom/rag.db'
    const { kbRoot, dbPath } = await importPreload()
    expect(kbRoot).toBe('/custom/kbs')
    expect(dbPath).toBe('/custom/rag.db')
  })

  test('leaves env untouched in http mode via argv flag', async () => {
    process.argv = [...ARGV_SAVE, '--http']
    const { kbRoot, dbPath } = await importPreload()
    expect(kbRoot).toBeUndefined()
    expect(dbPath).toBeUndefined()
  })

  test('leaves env untouched in http mode via RAG_TRANSPORT', async () => {
    process.env.RAG_TRANSPORT = 'http'
    const { kbRoot, dbPath } = await importPreload()
    expect(kbRoot).toBeUndefined()
    expect(dbPath).toBeUndefined()
  })
})
