import { getLogger } from '../log.js'
import { cosineSimilarity, embedTexts } from '../pipeline/embed.js'
import type { ChunkRecord, SearchResult, Store } from '../types.js'

export interface SearchParams {
  query: string
  kb?: string | string[]
  topK?: number
}

export const search = async (store: Store, params: SearchParams): Promise<SearchResult[]> => {
  const { query, kb, topK = 10 } = params

  const queryEmb = await embedQueries(query)
  const filteredKb = Array.isArray(kb) && kb.length === 0 ? undefined : kb
  const allChunks = filteredKb ? await store.getAllChunks(filteredKb) : await store.getAllChunks()
  const ftsScores = await buildFtsScores(store, query)
  const useFts = ftsScores !== null
  const scored: { id: number; content: string; metadata: string; score: number }[] = []

  for (const chunk of allChunks) {
    const score = scoreChunk(chunk, query, queryEmb, useFts, ftsScores)
    if (score > 0 && chunk.id) {
      scored.push({ id: chunk.id, content: chunk.content, metadata: chunk.metadata, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, topK)

  return top.map(s => {
    const meta = JSON.parse(s.metadata) as { kb: string; path: string; headings: string; chunkIndex: number; total: number }
    return {
      kb: meta.kb,
      relPath: meta.path,
      chunkIndex: meta.chunkIndex,
      content: s.content.slice(0, 1000),
      score: Math.round(s.score * 100) / 100,
    }
  })
}

const embedQueries = async (query: string): Promise<Float32Array | undefined> => {
  try {
    const [first] = await embedTexts([query])
    return first
  } catch (err) {
    const logger = getLogger('search')
    logger.warn('embed query failed, falling back to keyword search', err)
    return undefined
  }
}

const scoreChunk = (
  chunk: ChunkRecord,
  query: string,
  queryEmb: Float32Array | undefined,
  useFts: boolean,
  ftsScores: Map<number, number> | null,
): number => {
  const weights = { vector: 0.65, keyword: 0.35 }
  let score = scoreVector(queryEmb, chunk, weights.vector)
  score += scoreKeyword(chunk, query, ftsScores, useFts, weights.keyword)
  return score
}

const scoreVector = (queryEmb: Float32Array | undefined, chunk: ChunkRecord, weight: number): number => {
  if (!queryEmb || !chunk.embedding || chunk.embedding.length < 4) return 0
  const vec = new Float32Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.byteLength / 4)
  if (vec.length !== queryEmb.length) return 0
  const sim = cosineSimilarity(queryEmb, vec)
  return sim > 0.08 ? sim * weight : 0
}

const buildFtsScores = async (store: Store, query: string): Promise<Map<number, number> | null> => {
  const scores = new Map<number, number>()
  const words = query.split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return null
  const matchQuery = words.map(w => `"${w}"`).join(' AND ')
  const rows = await store.searchFts(matchQuery)
  if (rows === null) return null
  for (const row of rows) {
    scores.set(row.id, clamp(1 / (1 + Math.abs(row.rank)), 0, 1))
  }
  return scores
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value))
}

const scoreKeyword = (
  chunk: ChunkRecord,
  query: string,
  ftsScores: Map<number, number> | null,
  useFts: boolean,
  weight: number,
): number => {
  if (useFts) {
    const ftsScore = ftsScores?.get(chunk.id ?? -1)
    if (ftsScore !== undefined && ftsScore > 0) return ftsScore * weight
    return 0
  }
  const words = query.split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return 0
  const contentLower = chunk.content.toLowerCase()
  let hits = 0
  let rank = 0
  for (const word of words) {
    const idx = contentLower.indexOf(word.toLowerCase())
    if (idx !== -1) {
      hits++
      rank += 1 / (1 + idx / chunk.content.length)
    }
  }
  return hits > 0 ? (hits / words.length) * rank * weight : 0
}
