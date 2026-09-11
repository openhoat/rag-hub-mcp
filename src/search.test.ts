import { beforeEach, describe, expect, test, vi } from 'vitest'
import { search } from './search.js'
import type { ChunkRecord, Store } from './types.js'

vi.mock('./embed.js', () => ({
  embedTexts: vi.fn(async () => []),
  cosineSimilarity: vi.fn(() => 0),
}))

import { embedTexts } from './embed.js'

const mockedEmbed = vi.mocked(embedTexts)

beforeEach(() => {
  mockedEmbed.mockReset()
  mockedEmbed.mockResolvedValue([])
})

function makeChunk(id: number, kb: string, content: string, embedding?: number[]): ChunkRecord {
  return {
    id,
    fileId: id,
    chunkIndex: 0,
    content,
    metadata: JSON.stringify({ kb, path: `${kb}/file.md`, headings: '' }),
    embedding: embedding ? Buffer.from(new Float32Array(embedding).buffer) : null,
  }
}

function makeStore(chunks: ChunkRecord[]): Store {
  return {
    db: {} as never,
    close: () => {},
    listKbs: () => [],
    listFiles: () => [],
    getFile: () => null,
    upsertFile: () => 0,
    deleteFile: () => {},
    deleteFilesByKb: () => {},
    getKbId: () => 0,
    addKb: () => {},
    removeKb: () => {},
    insertChunk: () => 0,
    deleteChunks: () => {},
    getAllChunks(): ChunkRecord[] {
      return chunks
    },
    purgeKb: () => {},
  }
}

describe('search', () => {
  test('should rank keyword matches and cap content', async () => {
    const store = makeStore([makeChunk(1, 'kb', 'the quick brown fox jumps'), makeChunk(2, 'kb', 'a completely unrelated chunk')])
    const results = await search(store, { query: 'quick fox', kb: 'kb', topK: 5 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].relPath).toBe('kb/file.md')
    expect(results[0].content.length).toBeLessThanOrEqual(1000)
  })

  test('should filter by knowledge base', async () => {
    const store = makeStore([makeChunk(1, 'kbA', 'shared token content'), makeChunk(2, 'kbB', 'shared token content')])
    const results = await search(store, { query: 'shared', kb: 'kbA', topK: 10 })
    expect(results.every(r => r.kb === 'kbA')).toBe(true)
  })

  test('should return no results without vector or keyword match', async () => {
    const store = makeStore([makeChunk(1, 'kb', 'some content')])
    const results = await search(store, { query: 'zzzz', topK: 10 })
    expect(results).toEqual([])
  })
})
