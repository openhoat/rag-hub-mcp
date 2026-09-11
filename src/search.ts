import { cosineSimilarity, embedTexts } from './embed.js'
import { getLogger } from './log.js'
import type { ChunkRecord, SearchResult, Store } from './types.js'

export interface SearchParams {
  query: string
  kb?: string
  topK?: number
}

export async function search(store: Store, params: SearchParams): Promise<SearchResult[]> {
  const { query, kb, topK = 10 } = params

  const queryEmb = await embedQueries(query)
  const allChunks = kb ? store.getAllChunks(kb) : store.getAllChunks()
  const scored: { id: number; content: string; metadata: string; score: number }[] = []

  for (const chunk of allChunks) {
    if (kb) {
      const meta: { kb: string } = JSON.parse(chunk.metadata)
      if (meta.kb !== kb) continue
    }

    const score = scoreChunk(chunk, query, queryEmb)
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

async function embedQueries(query: string): Promise<Float32Array | undefined> {
  try {
    const [first] = await embedTexts([query])
    return first
  } catch (err) {
    const logger = getLogger('search')
    logger.warn('embed query failed, falling back to keyword search', err)
    return undefined
  }
}

function scoreChunk(chunk: ChunkRecord, query: string, queryEmb: Float32Array | undefined): number {
  const weights = { vector: 0.65, keyword: 0.35 }
  let score = scoreVector(queryEmb, chunk, weights.vector)
  score += scoreKeyword(query, chunk.content, weights.keyword)
  return score
}

function scoreVector(queryEmb: Float32Array | undefined, chunk: ChunkRecord, weight: number): number {
  if (!queryEmb || !chunk.embedding || chunk.embedding.length < 4) return 0
  const vec = new Float32Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.byteLength / 4)
  if (vec.length !== queryEmb.length) return 0
  const sim = cosineSimilarity(queryEmb, vec)
  return sim > 0.08 ? sim * weight : 0
}

function scoreKeyword(query: string, content: string, weight: number): number {
  const words = query.split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return 0

  const contentLower = content.toLowerCase()
  let hits = 0
  let rank = 0
  for (const word of words) {
    const idx = contentLower.indexOf(word.toLowerCase())
    if (idx !== -1) {
      hits++
      rank += 1 / (1 + idx / content.length)
    }
  }
  return hits > 0 ? (hits / words.length) * rank * weight : 0
}
