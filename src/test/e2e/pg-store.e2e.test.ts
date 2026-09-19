import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Store } from '../../shared/types'
import { createPgliteStore } from '../helpers'

/**
 * E2E for the PostgreSQL backend against a real Postgres engine compiled to
 * WASM (PGlite) with the pgvector extension bundled. It is instantiated fully
 * in-memory for the duration of the tests, with no server and no docker, and is
 * intentionally distinct from the production database.
 */
let store: Store

const makeEmbedding = (dimension = 4): Float32Array => new Float32Array(dimension)

beforeAll(async () => {
  store = await createPgliteStore(4)
})

afterAll(async () => {
  await store.close()
})

describe('pgStore (e2e, in-memory PGlite)', () => {
  test('should add kb and list documents', async () => {
    await store.addKb('dev')
    await store.addKb('infra')
    const kbId = await store.getKbId('dev')
    expect(kbId).toBeGreaterThan(0)
    const fileId = await store.upsertFile({ kbId, relPath: 'docs.md', sha256: 'x', mtime: 1, bytes: 10 })
    expect(fileId).toBeGreaterThan(0)
    const rec = await store.getFile(kbId, 'docs.md')
    expect(rec?.relPath).toBe('docs.md')
    const files = await store.listFiles('dev')
    expect(files.map(f => f.relPath)).toContain('docs.md')
  })

  test('should insert chunks with embedding and FTS and filter by kb', async () => {
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    const fileId = await store.upsertFile({ kbId, relPath: 'x.md', sha256: 's', mtime: 1, bytes: 5 })
    const cid = await store.insertChunk({
      fileId,
      chunkIndex: 0,
      content: 'the quick brown fox jumps',
      metadata: '{"kb":"kb","path":"x.md"}',
      embedding: makeEmbedding(),
    })
    expect(cid).toBeGreaterThan(0)
    const chunks = await store.getAllChunks('kb')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('the quick brown fox jumps')
    expect(chunks[0].embedding?.length).toBe(4)

    const fts = await store.searchFts(['quick', 'fox'])
    expect(fts).not.toBeNull()
    expect(fts?.[0]?.id).toBe(cid)

    await store.deleteChunks(fileId)
    expect(await store.getAllChunks()).toHaveLength(0)
  })

  test('should purge a knowledge base', async () => {
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    const fileId = await store.upsertFile({ kbId, relPath: 'y.md', sha256: 's', mtime: 1, bytes: 5 })
    await store.insertChunk({ fileId, chunkIndex: 0, content: 'some text', metadata: '{}', embedding: null })
    await store.purgeKb(kbId)
    expect(await store.listFiles('kb')).toHaveLength(0)
    expect(await store.getAllChunks()).toHaveLength(0)
  })

  test('should report kb stats', async () => {
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    const fileId = await store.upsertFile({ kbId, relPath: 'z.md', sha256: 's', mtime: 1, bytes: 42 })
    await store.insertChunk({ fileId, chunkIndex: 0, content: 'a', metadata: '{}', embedding: null })
    await store.insertChunk({ fileId, chunkIndex: 1, content: 'b', metadata: '{}', embedding: null })
    const info = (await store.listKbs()).find(k => k.name === 'kb')
    expect(info?.docCount).toBe(1)
    expect(info?.chunkCount).toBe(2)
    expect(info?.totalBytes).toBe(42)
  })

  test('should list known files and return kb name', async () => {
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    await store.upsertFile({ kbId, relPath: 'n.md', sha256: 'h', mtime: 3, bytes: 9 })
    const known = await store.listKnownFiles()
    const row = known.find(k => k.relPath === 'n.md')
    expect(row?.kbName).toBe('kb')
    expect(await store.getKbName(kbId)).toBe('kb')
  })

  test('should delete a single file', async () => {
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    const fileId = await store.upsertFile({ kbId, relPath: 'd.md', sha256: 's', mtime: 1, bytes: 5 })
    await store.deleteFile(fileId)
    expect(await store.getFile(kbId, 'd.md')).toBeNull()
  })

  test('should delete all files of a kb', async () => {
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    await store.upsertFile({ kbId, relPath: 'a.md', sha256: 's', mtime: 1, bytes: 5 })
    await store.upsertFile({ kbId, relPath: 'b.md', sha256: 's', mtime: 1, bytes: 5 })
    await store.deleteFilesByKb(kbId)
    expect(await store.listFiles('kb')).toHaveLength(0)
  })

  test('should update a file mtime', async () => {
    await store.addKb('kb')
    const kbId = await store.getKbId('kb')
    await store.upsertFile({ kbId, relPath: 'u.md', sha256: 's', mtime: 1, bytes: 5 })
    const known = await store.listKnownFiles()
    const row = known.find(k => k.relPath === 'u.md')
    expect(row).toBeTruthy()
    await store.updateFileMtime(row?.id as number, 99)
    const updated = await store.getFile(kbId, 'u.md')
    expect(updated?.mtime).toBe(99)
  })

  test('should remove a knowledge base', async () => {
    await store.addKb('tmpkb')
    const kbId = await store.getKbId('tmpkb')
    expect(kbId).toBeGreaterThan(0)
    await store.removeKb('tmpkb')
    expect(await store.getKbId('tmpkb')).toBe(0)
  })
})
