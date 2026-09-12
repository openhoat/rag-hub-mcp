import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { Store } from '../types.js'
import { createStore } from './store.js'

const makeStore = (): { store: Store; dir: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'rag-store-'))
  const store = createStore(join(dir, 'rag.db'))
  return { store, dir }
}

const cleanup = (dir: string, store: Store) => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
}

describe('store', () => {
  test('should add and list knowledge bases', () => {
    const { store, dir } = makeStore()
    store.addKb('dev')
    store.addKb('infra')
    store.addKb('dev')
    const kbs = store.listKbs().map(k => k.name)
    expect(kbs).toContain('dev')
    expect(kbs).toContain('infra')
    expect(kbs.filter(k => k === 'dev')).toHaveLength(1)
    cleanup(dir, store)
  })

  test('should upsert files and expose kb id', () => {
    const { store, dir } = makeStore()
    store.addKb('docs')
    const kbId = store.getKbId('docs')
    expect(kbId).toBeGreaterThan(0)
    const id = store.upsertFile({ kbId, relPath: 'a.md', sha256: 'x', mtime: 1, bytes: 10 })
    expect(id).toBeGreaterThan(0)
    const rec = store.getFile(kbId, 'a.md')
    expect(rec).not.toBeNull()
    expect(rec?.relPath).toBe('a.md')
    const id2 = store.upsertFile({ kbId, relPath: 'a.md', sha256: 'y', mtime: 2, bytes: 20 })
    expect(id2).toBe(id) // no duplicate row
    cleanup(dir, store)
  })

  test('should insert chunks with fts and delete them', () => {
    const { store, dir } = makeStore()
    store.addKb('kb')
    const kbId = store.getKbId('kb')
    const fileId = store.upsertFile({ kbId, relPath: 'x.md', sha256: 's', mtime: 1, bytes: 5 })
    const cid = store.insertChunk({ fileId, chunkIndex: 0, content: 'hello world', metadata: '{"kb":"kb"}', embedding: null })
    expect(cid).toBeGreaterThan(0)
    const chunks = store.getAllChunks('kb')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('hello world')
    store.deleteChunks(fileId)
    expect(store.getAllChunks()).toHaveLength(0)
    cleanup(dir, store)
  })

  test('should purge a knowledge base', () => {
    const { store, dir } = makeStore()
    store.addKb('kb')
    const kbId = store.getKbId('kb')
    const fileId = store.upsertFile({ kbId, relPath: 'y.md', sha256: 's', mtime: 1, bytes: 5 })
    store.insertChunk({ fileId, chunkIndex: 0, content: 'some text', metadata: '{}', embedding: null })
    store.purgeKb(kbId)
    expect(store.listFiles('kb')).toHaveLength(0)
    expect(store.getAllChunks()).toHaveLength(0)
    cleanup(dir, store)
  })

  test('should filter chunks across multiple knowledge bases', () => {
    const { store, dir } = makeStore()
    for (const kb of ['dev', 'infra', 'ops']) {
      store.addKb(kb)
      const kbId = store.getKbId(kb)
      const fileId = store.upsertFile({ kbId, relPath: `${kb}.md`, sha256: 's', mtime: 1, bytes: 5 })
      store.insertChunk({ fileId, chunkIndex: 0, content: `content ${kb}`, metadata: '{}', embedding: null })
    }
    expect(
      store
        .getAllChunks(['dev', 'infra'])
        .map(c => c.content)
        .sort(),
    ).toEqual(['content dev', 'content infra'])
    expect(store.getAllChunks('dev')).toHaveLength(1)
    expect(store.getAllChunks(['ops'])).toHaveLength(1)
    cleanup(dir, store)
  })

  test('should report kb stats (doc and chunk counts)', () => {
    const { store, dir } = makeStore()
    store.addKb('kb')
    const kbId = store.getKbId('kb')
    const fileId = store.upsertFile({ kbId, relPath: 'z.md', sha256: 's', mtime: 1, bytes: 42 })
    store.insertChunk({ fileId, chunkIndex: 0, content: 'a', metadata: '{}', embedding: null })
    store.insertChunk({ fileId, chunkIndex: 1, content: 'b', metadata: '{}', embedding: null })
    const info = store.listKbs().find(k => k.name === 'kb')
    expect(info?.docCount).toBe(1)
    expect(info?.chunkCount).toBe(2)
    expect(info?.totalBytes).toBe(42)
    cleanup(dir, store)
  })
})
