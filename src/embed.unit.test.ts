import { afterEach, describe, expect, test, vi } from 'vitest'
import { cosineSimilarity, embedTexts } from './embed.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('cosineSimilarity', () => {
  test('should return 1 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3])
    expect(cosineSimilarity(a, new Float32Array([1, 2, 3]))).toBeCloseTo(1)
  })

  test('should return 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([0, 1])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0)
  })

  test('should return 0 when a vector is all zeros', () => {
    const a = new Float32Array([0, 0, 0])
    const b = new Float32Array([1, 1, 1])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  test('should be scale invariant', () => {
    const a = new Float32Array([1, 2])
    const scaled = new Float32Array([2, 4])
    expect(cosineSimilarity(a, scaled)).toBeCloseTo(1)
  })
})

describe('embedTexts', () => {
  test('should return empty array for no texts', async () => {
    const embeddings = await embedTexts([])
    expect(embeddings).toEqual([])
  })

  test('should parse OpenAI-compatible response format', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0] }, { embedding: [0, 1] }] }),
    }))
    const result = await embedTexts(['a', 'b'], { baseUrl: 'http://emb/v1', model: 'm', apiKey: 'k' })
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(new Float32Array([1, 0]))
  })

  test('should parse Ollama embeddings array format', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ embeddings: [[1, 1]] }),
    }))
    const result = await embedTexts(['x'], { baseUrl: 'http://o/v1', model: 'm' })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(new Float32Array([1, 1]))
  })

  test('should throw on HTTP error status', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }))
    await expect(embedTexts(['x'], { baseUrl: 'http://e/v1', model: 'm' })).rejects.toThrow('embeddings API error 500')
  })

  test('should throw on unrecognized response shape', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ nope: true }) }))
    await expect(embedTexts(['x'], { baseUrl: 'http://e/v1', model: 'm' })).rejects.toThrow('unrecognized embeddings response format')
  })
})
