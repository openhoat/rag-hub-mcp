import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { Store } from '../../shared/types.js'
import { createSqliteStore } from './store.js'

const makeStore = (): { store: Store; dir: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'rag-store-'))
  const store = createSqliteStore(join(dir, 'rag.db'))
  return { store, dir }
}

const cleanup = async (dir: string, store: Store) => {
  await store.close()
  rmSync(dir, { recursive: true, force: true })
}

describe('store', () => {
  test('should add and list knowledge bases', async () => {
    const { store, dir } = makeStore()
    await store.addKb('dev')
    await store.addKb('infra')
    await store.addKb('dev')
    const kbs = (await store.listKbs()).map(k => k.name)
    expect(kbs).toContain('dev')
    expect(kbs).toContain('infra')
    expect(kbs.filter(k => k === 'dev')).toHaveLength(1)
    await cleanup(dir, store)
  })

  test('should upsert files and expose kb id', async () => {
    const { store, dir } = makeStore()
    await store.addKb('docs')
    const kbId = await store.getKbId('docs')
    expect(kbId).toBeGreaterThan(0)
    const id = await store.upsertFile({ kbId, relPath: 'a.md', sha256: 'x', mtime: 1, bytes: 10 })
    expect(id).toBeGreaterThan(0)
    const rec = await store.getFile(kbId, 'a.md')
    expect(rec).not.toBeNull()
    expect(rec?.relPath).toBe('a.md')
    const id2 = await store.upsertFile({ kbId, relPath: 'a.md', sha256: 'y', mtime: 2, bytes: 20 })
    expect(id2).toBe(id) // no duplicate row
    await cleanup(dir, store)
  })

  test('should insert chunks with fts and delete them', async () => {
    const { store, dir } = makeStore()
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    const fileId = await store.upsertFile({ kbId, relPath: 'x.md', sha256: 's', mtime: 1, bytes: 5 })
    const cid = await store.insertChunk({ fileId, chunkIndex: 0, content: 'hello world', metadata: '{"kb":"kb"}', embedding: null })
    expect(cid).toBeGreaterThan(0)
    const chunks = await store.getAllChunks('kb')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('hello world')
    await store.deleteChunks(fileId)
    expect(await store.getAllChunks()).toHaveLength(0)
    await cleanup(dir, store)
  })

  test('should purge a knowledge base', async () => {
    const { store, dir } = makeStore()
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    const fileId = await store.upsertFile({ kbId, relPath: 'y.md', sha256: 's', mtime: 1, bytes: 5 })
    await store.insertChunk({ fileId, chunkIndex: 0, content: 'some text', metadata: '{}', embedding: null })
    await store.purgeKb(kbId)
    expect(await store.listFiles('kb')).toHaveLength(0)
    expect(await store.getAllChunks()).toHaveLength(0)
    await cleanup(dir, store)
  })

  test('should filter chunks across multiple knowledge bases', async () => {
    const { store, dir } = makeStore()
    for (const kb of ['dev', 'infra', 'ops']) {
      await store.addKb(kb)
      const kbId = await store.getKbId(kb)
      const fileId = await store.upsertFile({ kbId, relPath: `${kb}.md`, sha256: 's', mtime: 1, bytes: 5 })
      await store.insertChunk({ fileId, chunkIndex: 0, content: `content ${kb}`, metadata: '{}', embedding: null })
    }
    expect((await store.getAllChunks(['dev', 'infra'])).map(c => c.content).sort()).toEqual(['content dev', 'content infra'])
    expect(await store.getAllChunks('dev')).toHaveLength(1)
    expect(await store.getAllChunks(['ops'])).toHaveLength(1)
    await cleanup(dir, store)
  })

  test('should report kb stats (doc and chunk counts)', async () => {
    const { store, dir } = makeStore()
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    const fileId = await store.upsertFile({ kbId, relPath: 'z.md', sha256: 's', mtime: 1, bytes: 42 })
    await store.insertChunk({ fileId, chunkIndex: 0, content: 'a', metadata: '{}', embedding: null })
    await store.insertChunk({ fileId, chunkIndex: 1, content: 'b', metadata: '{}', embedding: null })
    const info = (await store.listKbs()).find(k => k.name === 'kb')
    expect(info?.docCount).toBe(1)
    expect(info?.chunkCount).toBe(2)
    expect(info?.totalBytes).toBe(42)
    await cleanup(dir, store)
  })
})
