import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Shared mutable state for the config mock (isHttpMode is a live binding via a
// getter; changing httpState.enabled + reloading index.js re-evaluates main()).
const state = vi.hoisted(() => ({ httpEnabled: false, apiKey: 'key' }))

vi.mock('./config.js', () => ({
  env: {
    PORT: 8000,
    SCAN_INTERVAL: 0,
    get MCP_API_KEY() {
      return state.apiKey
    },
    MCP_SESSION_TTL_SECONDS: 1800,
    MCP_SESSION_MAX: 100,
    MCP_SESSION_CREATE_RATE_PER_MINUTE: 30,
    VERSION: '1.0.0',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  },
  get isHttpMode() {
    return state.httpEnabled
  },
  requireHttpApiKey: vi.fn((_isHttp: boolean, apiKey: string) => apiKey.trim() !== ''),
}))

vi.mock('./core/storeFactory.js', () => ({
  createStore: vi.fn(),
}))

vi.mock('./core/ingest.js', () => ({
  scanAll: vi.fn(),
}))

vi.mock('./transport/mcp.js', () => ({
  createMcpServer: vi.fn(),
  createStreamableHttpTransport: vi.fn(),
}))

vi.mock('./transport/rest.js', () => ({
  createRestApp: vi.fn(),
}))

import { requireHttpApiKey } from './config.js'
import { scanAll } from './core/ingest.js'
import { createStore } from './core/storeFactory.js'
import { makeStubStore } from './testing/helpers.js'
import { createMcpServer, createStreamableHttpTransport } from './transport/mcp.js'
import { createRestApp } from './transport/rest.js'

const store = makeStubStore()
const stubServer = () => ({ connect: vi.fn().mockResolvedValue(undefined) })
const stubTransport = () => ({ handleRequest: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) })

describe('main bootstrap', () => {
  const realExit = process.exit
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    state.httpEnabled = false
    state.apiKey = 'key'
    vi.mocked(createStore).mockResolvedValue(store)
    vi.mocked(scanAll).mockResolvedValue({ added: 1, modified: 0, deleted: 0, skipped: 0 })
    vi.mocked(createMcpServer).mockReturnValue(stubServer() as never)
    vi.mocked(createStreamableHttpTransport).mockReturnValue(stubTransport() as never)
    vi.mocked(createRestApp).mockReset()
    vi.mocked(requireHttpApiKey).mockClear()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    process.exit = realExit
    vi.clearAllMocks()
  })

  test('stdio mode: creates store, scans, connects MCP and returns without HTTP', async () => {
    const { main } = await import('./index.js')
    await main()
    expect(createStore).toHaveBeenCalledTimes(1)
    expect(scanAll).toHaveBeenCalledTimes(1)
    expect(createMcpServer).toHaveBeenCalledTimes(1)
    expect(createRestApp).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test('stdio mode: initial scan failure is swallowed, server still starts', async () => {
    const { main } = await import('./index.js')
    vi.mocked(scanAll).mockRejectedValueOnce(new Error('scan boom'))
    await expect(main()).resolves.toBeUndefined()
    expect(createMcpServer).toHaveBeenCalledTimes(1)
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test('HTTP mode with valid API key starts REST + MCP endpoints and listens', async () => {
    state.httpEnabled = true
    const app = fastify()
    vi.spyOn(app, 'listen').mockResolvedValue(undefined as never)
    vi.mocked(createRestApp).mockResolvedValue(app as never)
    const { main } = await import('./index.js')
    await main()
    expect(requireHttpApiKey).toHaveBeenCalledWith(true, 'key')
    expect(createRestApp).toHaveBeenCalledTimes(1)
    expect(app.listen).toHaveBeenCalledWith({ port: 8000, host: '0.0.0.0' })
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test('HTTP mode without an API key fails fast via process.exit', async () => {
    state.httpEnabled = true
    state.apiKey = ''
    // process.exit is mocked to throw in this test so main() actually stops
    // after the fail-fast branch (a returning mock would let main() continue).
    exitSpy.mockImplementation(() => {
      throw new Error('process.exit called')
    })
    const { main } = await import('./index.js')
    await expect(main()).rejects.toThrow('process.exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
