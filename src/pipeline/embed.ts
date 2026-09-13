import { env } from '../config.js'

export interface EmbedConfig {
  baseUrl: string
  apiKey?: string
  model: string
  batchSize?: number
}

const defaultConfig = (): EmbedConfig => {
  return {
    baseUrl: env.EMBEDDINGS_BASE_URL,
    apiKey: env.EMBEDDINGS_API_KEY,
    model: env.EMBEDDINGS_MODEL,
  }
}

export const embedTexts = async (texts: string[], config: EmbedConfig = defaultConfig()): Promise<Float32Array[]> => {
  if (texts.length === 0) return []
  const batchSize = config.batchSize ?? 16
  const result: Float32Array[] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const embeddings = await embedBatch(batch, config)
    for (const emb of embeddings) {
      result.push(new Float32Array(emb))
    }
  }
  return result
}

const embedBatch = async (texts: string[], config: EmbedConfig): Promise<number[][]> => {
  const url = `${config.baseUrl}/embeddings`
  const body = { model: config.model, input: texts }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`embeddings API error ${res.status}`)
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] } | { embeddings: number[][] }
  // OpenAI-compatible format: { data: [{ embedding: [...] }] }
  if ('data' in data && Array.isArray(data.data)) {
    return data.data.map(d => d.embedding)
  }
  // Ollama format: { embeddings: [[...]] }
  if ('embeddings' in data && Array.isArray(data.embeddings)) {
    return data.embeddings
  }
  throw new Error('unrecognized embeddings response format')
}

export const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}
