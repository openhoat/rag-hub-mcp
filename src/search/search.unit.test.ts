import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ChunkRecord, Store } from '../shared/types.js'
import { makeChunk, makeStubStore, stubEmbeddingsApi, unitEmbeddings } from '../test/helpers'
import { search } from './search.js'

// Embeddings are served via a stubbed global fetch (OpenAI-compatible format).
// embedTexts returns a single query vector, and cosineSimilarity runs for real.

const makeStore = (chunks: ChunkRecord[], searchFts?: (words: string[]) => Array<{ id: number; score: number }> | null): Store => {
  return makeStubStore({
    async getAllChunks(kb?: string | string[]): Promise<ChunkRecord[]> {
      const names = kb ? (Array.isArray(kb) ? kb : [kb]) : null
      if (names) return chunks.filter(c => names.includes((JSON.parse(c.metadata) as { kb: string }).kb))
      return chunks
    },
    searchFts: async (words: string[]) => (searchFts ? searchFts(words) : null),
  })
}

let restoreFetch: () => void

beforeEach(() => {
  restoreFetch = stubEmbeddingsApi(() => [unitEmbeddings(4)])
})

afterEach(() => {
  restoreFetch?.()
})

describe('search', () => {
  test('should rank keyword matches via FTS and cap content', async () => {
    const rowsByQuery: Record<string, Array<{ id: number; score: number }>> = { 'quick AND fox': [{ id: 1, score: 0.5 }] }
    const store = makeStore(
      [makeChunk(1, 'kb', 'the quick brown fox jumps over the lazy dog'), makeChunk(2, 'kb', 'a completely unrelated chunk')],
      words => {
        return rowsByQuery[words.join(' AND ')] ?? []
      },
    )
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

  test('should filter across multiple knowledge bases', async () => {
    const store = makeStore([makeChunk(1, 'kbA', 'shared token content'), makeChunk(2, 'kbB', 'shared token content')])
    const results = await search(store, { query: 'shared', kb: ['kbA', 'kbB'], topK: 10 })
    expect(results).toHaveLength(2)
    expect(results.map(r => r.kb).sort()).toEqual(['kbA', 'kbB'])
  })

  test('should treat empty kb array as searching all knowledge bases', async () => {
    const store = makeStore([makeChunk(1, 'kbA', 'alpha content'), makeChunk(2, 'kbB', 'alpha other')])
    const results = await search(store, { query: 'alpha', kb: [], topK: 10 })
    expect(results).toHaveLength(2)
  })

  test('should return no results without vector or keyword match', async () => {
    const store = makeStore([makeChunk(1, 'kb', 'some content')])
    const results = await search(store, { query: 'zzzz', topK: 10 })
    expect(results).toEqual([])
  })

  test('should score chunks by vector similarity when embeddings match', async () => {
    // Chunk 1 embedding matches the query vector (cos 1), chunk 2 is orthogonal (cos 0).
    const store = makeStore([
      makeChunk(1, 'kb', 'unrelated text that should rank via vector', [1.0, 0.0, 0.0, 0.0]),
      makeChunk(2, 'kb', 'unrelated text', [0.0, 1.0, 0.0, 0.0]),
    ])
    const results = await search(store, { query: 'anything', kb: 'kb', topK: 10 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].relPath).toBe('kb/file.md')
    expect(results[0].score).toBeGreaterThan(0)
  })

  test('should combine vector and keyword weights', async () => {
    // Chunk has both a keyword match and a matching embedding => higher score than keyword alone.
    const store = makeStore([makeChunk(1, 'kb', 'alpha beta gamma delta', [1.0, 0.0, 0.0, 0.0])])
    const keywordStore = makeStore([makeChunk(2, 'kb', 'alpha beta gamma delta')])
    const [both] = await search(store, { query: 'alpha', kb: 'kb', topK: 1 })
    const [keywordOnly] = await search(keywordStore, { query: 'alpha', kb: 'kb', topK: 1 })
    expect(both.score).toBeGreaterThan(keywordOnly.score)
  })

  test('should respect topK limit', async () => {
    const store = makeStore([
      makeChunk(1, 'kb', 'alpha common phrase one'),
      makeChunk(2, 'kb', 'alpha common phrase two'),
      makeChunk(3, 'kb', 'alpha common phrase three'),
    ])
    const results = await search(store, { query: 'alpha common', kb: 'kb', topK: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  test('should fall back to indexOf keyword matching when FTS unavailable', async () => {
    const store = makeStore([makeChunk(1, 'kb', 'the quick brown fox appears here')], () => null)
    const results = await search(store, { query: 'quick fox', kb: 'kb', topK: 5 })
    expect(results.length).toBeGreaterThan(0)
  })

  test('should return empty when query is empty or only short words', async () => {
    const store = makeStore([makeChunk(1, 'kb', 'some content here')])
    const results = await search(store, { query: '', kb: 'kb', topK: 5 })
    expect(results).toEqual([])
  })
})
