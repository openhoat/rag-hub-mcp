import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Store } from '../types.js'
import { createStore } from './store.js'

vi.mock('../pipeline/embed.js', () => ({
  embedTexts: vi.fn(async () => [new Float32Array([0.5, 0.5])]),
  cosineSimilarity: vi.fn(() => 0),
}))
vi.mock('../pipeline/extract.js', () => ({
  extractText: vi.fn(async () => 'extracted content'),
  isTextFile: vi.fn(() => true),
  TEXT_EXTENSIONS: new Set(['.md']),
}))

import { addDocument, deleteDocument, deleteKb, readDocument, scanAll } from './ingest.js'

let root: string
let store: Store

const setupKb = (): { root: string; store: Store } => {
  const dir = mkdtempSync(join(tmpdir(), 'rag-ingest-'))
  const dbDir = mkdtempSync(join(tmpdir(), 'rag-ingest-db-'))
  const s = createStore(join(dbDir, 'rag.db'))
  const kbRoot = join(dir, 'kbs')
  mkdirSync(join(kbRoot, 'docs'), { recursive: true })
  return { root: kbRoot, store: s }
}

afterEach(() => {
  vi.clearAllMocks()
  if (root) rmSync(root, { recursive: true, force: true })
  if (store) store.close()
})

describe('scanAll', () => {
  test('should index files into a knowledge base', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), '# hello', 'utf-8')
    const result = await scanAll(store, root)
    expect(result.added).toBe(1)
    const kbs = store.listKbs()
    expect(kbs).toHaveLength(1)
    expect(kbs[0].name).toBe('docs')
    expect(kbs[0].docCount).toBe(1)
  })

  test('should skip unchanged files on a second scan', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), '# hello', 'utf-8')
    await scanAll(store, root)
    const second = await scanAll(store, root)
    expect(second.skipped).toBe(1)
    expect(second.added).toBe(0)
  })

  test('should detect modified files', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const p = join(root, 'docs', 'a.md')
    writeFileSync(p, '# v1', 'utf-8')
    await scanAll(store, root)
    await new Promise(r => setTimeout(r, 5))
    writeFileSync(p, '# v2 changed', 'utf-8')
    const result = await scanAll(store, root)
    expect(result.modified).toBe(1)
  })

  test('should handle a missing root gracefully', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const result = await scanAll(store, join(root, 'missing'))
    expect(result.added).toBe(0)
  })
})

describe('addDocument', () => {
  test('should write a file and index it', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    await addDocument(store, 'docs', 'notes/new.md', '# new', root)
    const kbs = store.listKbs()
    expect(kbs.find(k => k.name === 'docs')?.docCount).toBe(1)
  })

  test('should reject paths escaping the KB root', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    await expect(addDocument(store, 'docs', '../outside.md', 'x', root)).rejects.toThrow('invalid path')
    await expect(addDocument(store, 'docs', 'a/../../../escape.md', 'x', root)).rejects.toThrow('invalid path')
  })
})

describe('deleteDocument', () => {
  test('should remove the file and index entry', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), 'x', 'utf-8')
    await scanAll(store, root)
    await deleteDocument(store, 'docs', 'a.md', root)
    expect(store.listFiles('docs')).toHaveLength(0)
  })

  test('should reject traversal paths', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    await expect(deleteDocument(store, 'docs', '../../etc/passwd', root)).rejects.toThrow('invalid path')
  })
})

describe('readDocument', () => {
  test('should return extracted content for an existing file', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), '# hello', 'utf-8')
    const content = await readDocument('docs', 'a.md', root)
    expect(content).toBe('extracted content')
  })

  test('should return null for a missing file', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const content = await readDocument('docs', 'missing.md', root)
    expect(content).toBeNull()
  })

  test('should reject paths escaping the KB root', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    await expect(readDocument('docs', '../../etc/passwd', root)).rejects.toThrow('invalid path')
  })
})

describe('deleteKb', () => {
  test('should remove the folder and its records', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), 'x', 'utf-8')
    await scanAll(store, root)
    await deleteKb(store, 'docs', root)
    expect(store.listKbs()).toHaveLength(0)
  })

  test('should handle a kb that does not exist', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    await deleteKb(store, 'missing', root)
    expect(store.listKbs()).toHaveLength(0)
  })
})
