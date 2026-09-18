import { env } from '../config.js'
import { getLogger } from '../log.js'

const logger = getLogger('contextual-chunking')

export interface ChunkContext {
  path: string
  headings: string
}

export interface ContextualChunkingConfig {
  enabled: boolean
  baseUrl: string
  model: string
}

export const defaultConfig = (): ContextualChunkingConfig => {
  return {
    enabled: Boolean(env.CONTEXTUAL_CHUNKING_ENABLED),
    baseUrl: env.CONTEXTUAL_CHUNKING_BASE_URL ?? env.EMBEDDINGS_BASE_URL,
    model: env.CONTEXTUAL_CHUNKING_MODEL ?? 'phi3:minimal',
  }
}

/**
 * Prepend a LLM-generated context sentence to a chunk before embedding, so the
 * vector stays representative of the chunk's place in its document. When
 * disabled, or when the LLM call fails, the raw content is returned unchanged
 * and the stored text is never modified.
 */
export const enrichChunkContent = async (
  content: string,
  context?: ChunkContext,
  config: ContextualChunkingConfig = defaultConfig(),
): Promise<string> => {
  if (!config.enabled) return content
  try {
    const sentence = await generateContext(content, context, config)
    return sentence ? `${sentence}\n${content}` : content
  } catch (err) {
    logger.warn('contextual chunking failed, embedding raw chunk', err)
    return content
  }
}

const SYSTEM_PROMPT =
  'You generate a compact context sentence that places a document chunk within its larger document. ' +
  'Keep it factual, under 40 words, and focused on terms that help an embedding model retrieve the chunk.'

const generateContext = async (content: string, context: ChunkContext | undefined, config: ContextualChunkingConfig): Promise<string> => {
  const url = `${config.baseUrl}/chat/completions`
  const docContext =
    context && (context.path || context.headings)
      ? `\nDocument path: ${context.path ?? ''}${context.headings ? `\nSection headings: ${context.headings}` : ''}`
      : ''
  const body = {
    model: config.model,
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Here is a chunk of a larger document${docContext}:\n\n"""${content}"""\n\nProvide a concise context sentence for this chunk. Reply with only that sentence.`,
      },
    ],
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`chat completions error ${res.status}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}
