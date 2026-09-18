import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyReply, FastifyRequest } from 'fastify'
import fastify from 'fastify'
import { describe, expect, test, vi } from 'vitest'
import { SessionRegistry } from './core/session-registry.js'
import { closeSession, handleExistingSession, handleNewSession, registerMcpEndpoints } from './index.js'
import { makeStubQueue, makeStubStore, makeStubWorker } from './test/helpers'
import type { Store } from './types.js'

vi.mock('./transport/mcp.js', () => ({
  createMcpServer: vi.fn(),
  createStreamableHttpTransport: vi.fn(),
}))

vi.mock('./core/store-factory.js', () => ({
  createStore: vi.fn(),
}))

type McpSession = {
  server: McpServer
  transport: StreamableHTTPServerTransport
}

const makeRequest = (sessionId: string | undefined): FastifyRequest =>
  ({
    raw: { headers: { 'mcp-session-id': sessionId } },
    body: { jsonrpc: '2.0' },
    headers: {},
  }) as unknown as FastifyRequest

const makeReply = (): FastifyReply & { rawBody: string | undefined } => {
  const holder = { value: undefined as string | undefined }
  const raw = {
    statusCode: 200,
    writableEnded: false,
    end: (body: string) => {
      holder.value = body
      raw.writableEnded = true
    },
  }
  const reply = {
    raw,
    code: (code: number) => {
      raw.statusCode = code
      return reply
    },
    send: (body: unknown) => {
      holder.value = JSON.stringify(body)
    },
    hijack: () => {},
  } as unknown as FastifyReply & { rawBody: string | undefined }
  Object.defineProperty(reply, 'rawBody', {
    get: () => holder.value,
    enumerable: true,
  })
  return reply
}

const readBody = (reply: FastifyReply): string | undefined => (reply as unknown as { rawBody?: string }).rawBody

describe('index bootstrap helpers', () => {
  test('closeSession removes a known session and closes its transport', () => {
    const sessions = new SessionRegistry<McpSession>(10, 1000)
    const close = vi.fn().mockResolvedValue(undefined)
    sessions.set('s1', {
      server: { connect: vi.fn() } as unknown as McpServer,
      transport: {
        close,
        handleRequest: vi.fn(),
      } as unknown as StreamableHTTPServerTransport,
    })
    expect(sessions.size()).toBe(1)
    closeSession(sessions, 's1')
    expect(sessions.size()).toBe(0)
    expect(close).toHaveBeenCalledTimes(1)
  })

  test('closeSession is a no-op for an unknown session', () => {
    const sessions = new SessionRegistry<McpSession>(10, 1000)
    expect(() => closeSession(sessions, 'missing')).not.toThrow()
    expect(sessions.size()).toBe(0)
  })

  test('handleExistingSession returns 404 for an unknown session', async () => {
    const sessions = new SessionRegistry<McpSession>(10, 1000)
    const reply = makeReply()
    await handleExistingSession(sessions, 'nope', makeRequest('nope'), reply)
    expect(reply.raw.statusCode).toBe(404)
    expect(readBody(reply)).toContain('unknown session')
  })

  test('handleExistingSession forwards the request to the session transport', async () => {
    const sessions = new SessionRegistry<McpSession>(10, 1000)
    const handleRequest = vi.fn().mockResolvedValue(undefined)
    sessions.set('s1', {
      server: { connect: vi.fn() } as unknown as McpServer,
      transport: {
        close: vi.fn(),
        handleRequest,
      } as unknown as StreamableHTTPServerTransport,
    })
    const request = makeRequest('s1')
    request.body = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    const reply = makeReply()
    await handleExistingSession(sessions, 's1', request, reply)
    expect(handleRequest).toHaveBeenCalled()
  })

  test('handleNewSession wires a new server+transport and handles the request', async () => {
    const store = makeStubStore() as unknown as Store
    const queue = makeStubQueue()
    const sessions = new SessionRegistry<McpSession>(10, 1000)
    const handleRequest = vi.fn().mockResolvedValue(undefined)
    const transport = {
      handleRequest,
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as StreamableHTTPServerTransport
    const server = {
      connect: vi.fn().mockResolvedValue(undefined),
    } as unknown as McpServer

    const mcp = await import('./transport/mcp.js')
    vi.mocked(mcp.createStreamableHttpTransport).mockReturnValue(transport)
    vi.mocked(mcp.createMcpServer).mockReturnValue(server)

    const request = makeRequest(undefined)
    const reply = makeReply()
    await handleNewSession(sessions, store, queue, request, reply)
    expect(server.connect).toHaveBeenCalledWith(transport)
    expect(handleRequest).toHaveBeenCalled()
  })

  test('handleNewSession returns 500 when the transport throws', async () => {
    const store = makeStubStore() as unknown as Store
    const queue = makeStubQueue()
    const sessions = new SessionRegistry<McpSession>(10, 1000)
    const mcp = await import('./transport/mcp.js')
    vi.mocked(mcp.createStreamableHttpTransport).mockReturnValue({
      handleRequest: vi.fn().mockRejectedValue(new Error('boom')),
      close: vi.fn(),
    } as unknown as StreamableHTTPServerTransport)
    vi.mocked(mcp.createMcpServer).mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
    } as unknown as McpServer)

    const request = makeRequest(undefined)
    const reply = makeReply()
    await handleNewSession(sessions, store, queue, request, reply)
    expect(reply.raw.statusCode).toBe(500)
    expect(readBody(reply)).toContain('mcp error')
  })

  test('registerMcpEndpoints wires MCP routes with auth, session and capacity handling', async () => {
    const app = fastify()
    const store = makeStubStore() as unknown as Store
    const queue = makeStubQueue()
    const sessions = new SessionRegistry<McpSession>(1, 1000)
    const mcp = await import('./transport/mcp.js')
    vi.mocked(mcp.createStreamableHttpTransport).mockReturnValue({
      handleRequest: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as StreamableHTTPServerTransport)
    vi.mocked(mcp.createMcpServer).mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
    } as unknown as McpServer)

    await registerMcpEndpoints(app, sessions, store, queue, {
      createRateLimit: 100,
    })
    await app.ready()

    const listRes = await app.inject({ method: 'GET', url: '/mcp' })
    expect(listRes.statusCode).toBe(200)
    expect(JSON.parse(listRes.body)).toMatchObject({ name: 'rag-hub-mcp' })

    sessions.set('occupied', {
      server: {} as McpServer,
      transport: {} as StreamableHTTPServerTransport,
    })
    const capRes = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: 'Bearer test-secret-key' },
    })
    expect(capRes.statusCode).toBe(503)

    const notFound = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: 'Bearer test-secret-key',
        'mcp-session-id': 'ghost',
      },
    })
    expect(notFound.statusCode).toBe(404)
  })

  test('registerShutdown closes the store on signal', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const store = { close } as unknown as Store
    const { registerShutdown } = await import('./index.js')
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    registerShutdown(store, makeStubWorker(), makeStubQueue())
    process.emit('SIGTERM')
    await new Promise(r => setTimeout(r, 10))
    expect(close).toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(0)
    exit.mockRestore()
  })
})
