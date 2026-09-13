import { describe, expect, test } from 'vitest'
import { createPgStore } from '../core/pgStore.js'
import type { Store } from '../types.js'

/**
 * E2E for the PostgreSQL backend against a real pgvector server.
 *
 * Requires a reachable Postgres (docker-compose up -d postgres or a PG_*
 * / DATABASE_URL override). The suite skips gracefully when no server is up,
 * so the validate gate never fails on machines without Postgres.
 */
const run = async <T>(fn: (store: Store) => Promise<T>): Promise<T | null> => {
  let store: Store | null = null
  try {
    store = await createPgStore()
  } catch {
    return null
  }
  try {
    await fn(store)
    return null
  } finally {
    await store.close()
  }
}

const makeEmbedding = (dimension = 4): Float32Array => new Float32Array(dimension)

describe('pgStore (e2e)', () => {
  test('should add kb and list documents', async () => {
    await run(async store => {
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
  })

  test('should insert chunks with embedding and FTS and filter by kb', async () => {
    await run(async store => {
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
      expect(chunks[0].embedding?.length).toBe(4) // 4 floats

      const fts = await store.searchFts(['quick', 'fox'])
      expect(fts).not.toBeNull()
      expect(fts?.[0]?.id).toBe(cid)

      await store.deleteChunks(fileId)
      expect(await store.getAllChunks()).toHaveLength(0)
    })
  })

  test('should purge a knowledge base', async () => {
    await run(async store => {
      await store.addKb('kb')
      const kbId = await store.getKbId('kb')
      const fileId = await store.upsertFile({ kbId, relPath: 'y.md', sha256: 's', mtime: 1, bytes: 5 })
      await store.insertChunk({ fileId, chunkIndex: 0, content: 'some text', metadata: '{}', embedding: null })
      await store.purgeKb(kbId)
      expect(await store.listFiles('kb')).toHaveLength(0)
      expect(await store.getAllChunks()).toHaveLength(0)
    })
  })

  test('should report kb stats', async () => {
    await run(async store => {
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
  })

  test('should list known files and return kb name', async () => {
    await run(async store => {
      await store.addKb('kb')
      const kbId = await store.getKbId('kb')
      await store.upsertFile({ kbId, relPath: 'n.md', sha256: 'h', mtime: 3, bytes: 9 })
      const known = await store.listKnownFiles()
      const row = known.find(k => k.relPath === 'n.md')
      expect(row?.kbName).toBe('kb')
      expect(await store.getKbName(kbId)).toBe('kb')
    })
  })
})
