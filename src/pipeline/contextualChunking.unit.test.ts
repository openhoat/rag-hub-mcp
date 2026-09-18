import { afterEach, describe, expect, test, vi } from 'vitest'
import { type ContextualChunkingConfig, defaultConfig, enrichChunkContent } from './contextualChunking.js'

const config = (overrides: Partial<ContextualChunkingConfig> = {}): ContextualChunkingConfig => ({
  enabled: true,
  baseUrl: 'http://llm/v1',
  model: 'phi3:minimal',
  ...overrides,
})

const stubChat = (content: string, ok = true) => {
  vi.stubGlobal('fetch', async () => ({
    ok,
    json: async () => ({ choices: [{ message: { content } }] }),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('defaultConfig', () => {
  test('should enable only when the env flag is set', () => {
    expect(defaultConfig().enabled).toBe(false)
  })
})

describe('enrichChunkContent', () => {
  test('should return content unchanged when disabled', async () => {
    const content = 'raw chunk'
    const result = await enrichChunkContent(content, undefined, { enabled: false, baseUrl: '', model: '' })
    expect(result).toBe(content)
  })

  test('should prepend the generated context sentence', async () => {
    stubChat('This fragment details the API v2 rate limits.')
    const result = await enrichChunkContent('raw chunk', { path: 'docs/api.md', headings: 'Limits' }, config())
    expect(result).toBe('This fragment details the API v2 rate limits.\nraw chunk')
  })

  test('should call the chat completions endpoint with the OpenAI request shape', async () => {
    const calls: [string, { body: string; headers: Record<string, string> }][] = []
    vi.stubGlobal('fetch', (url: string, init: { body: string; headers: Record<string, string> }) => {
      calls.push([url, init])
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ctx' } }] }) }
    })

    await enrichChunkContent('raw chunk', { path: 'a.md', headings: 'H1' }, config())

    const [url, init] = calls[0]
    expect(url).toBe('http://llm/v1/chat/completions')
    const body = JSON.parse(init.body) as { max_tokens: number; messages: { role: string; content: string }[] }
    expect(body.max_tokens).toBe(80)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].content).toContain('a.md')
    expect(body.messages[1].content).toContain('H1')
  })

  test('should fall back to the raw chunk when the API call fails', async () => {
    stubChat('', false)
    const result = await enrichChunkContent('raw chunk', undefined, config())
    expect(result).toBe('raw chunk')
  })

  test('should fall back to the raw chunk when the response has no content', async () => {
    stubChat('')
    const result = await enrichChunkContent('raw chunk', undefined, config())
    expect(result).toBe('raw chunk')
  })
})
