import { mkdtempSync, rmSync } from 'node:fs'
import type { Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Express } from 'express'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createMcpServer, createStreamableHttpTransport } from './mcp.js'
import { createRestApp } from './rest.js'
import { createStore } from './store.js'
import type { Store } from './types.js'

const AUTH = { Authorization: 'Bearer test-secret-key' }
const ACCEPT = 'application/json, text/event-stream'

interface SessionEntry {
  server: McpServer
  transport: StreamableHTTPServerTransport
}

async function postSse(
  base: string,
  body: unknown,
  sessionId?: string,
): Promise<{ res: Response; messages: Array<Record<string, unknown>> }> {
  const headers: Record<string, string> = { ...AUTH, 'Content-Type': 'application/json', Accept: ACCEPT }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId
  const res = await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  const messages = text
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.replace(/^data:\s*/, ''))
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line)) as Array<Record<string, unknown>>
  return { res, messages }
}

async function initialize(base: string): Promise<string> {
  const { res, messages } = await postSse(base, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
  })
  expect(res.status).toBe(200)
  const header = res.headers.get('mcp-session-id')
  expect(header).toBeTruthy()
  const result = messages.find(m => m.id === 1)?.result as { serverInfo?: { name?: string } } | undefined
  expect(result?.serverInfo?.name).toBe('rag-hub-mcp')
  return header as string
}

describe('MCP streamable-http endpoint (per-session transports)', () => {
  let root: string
  let store: Store
  let app: Express
  let server: HttpServer
  let base: string
  let sessions: Map<string, SessionEntry>

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'rag-mcp-'))
    store = createStore(join(root, 'rag.db'))
    app = createRestApp(store)
    sessions = new Map<string, SessionEntry>()

    function closeSession(id: string) {
      const entry = sessions.get(id)
      if (!entry) return
      sessions.delete(id)
      entry.transport.close().catch(() => {})
    }

    app.post('/mcp', async (req, res) => {
      const apiKey = 'test-secret-key'
      if (apiKey) {
        const auth = req.headers.authorization
        if (auth !== `Bearer ${apiKey}`) {
          res.status(401).json({ error: 'unauthorized' })
          return
        }
      }
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      try {
        if (sessionId) {
          const entry = sessions.get(sessionId)
          if (!entry) {
            res.status(404).json({ error: 'unknown session' })
            return
          }
          await entry.transport.handleRequest(req, res, req.body)
          return
        }
        const transport = createStreamableHttpTransport({
          onSessionInitialized: id => {
            sessions.set(id, { server, transport })
          },
          onSessionClosed: closeSession,
        })
        const server = createMcpServer(store)
        await server.connect(transport)
        await transport.handleRequest(req, res, req.body)
      } catch {
        if (!res.headersSent) res.status(500).json({ error: 'mcp error' })
      }
    })

    server = await new Promise<HttpServer>(resolve => {
      const s = app.listen(0, () => resolve(s))
    })
    const addr = server.address() as AddressInfo
    base = `http://127.0.0.1:${addr.port}`
  })

  afterEach(() => {
    server?.close()
    store?.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  test('should run initialize, notifications/initialized, tools/list and tools/call on one session', async () => {
    const sessionId = await initialize(base)

    const initNotif = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json', Accept: ACCEPT, 'Mcp-Session-Id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    expect(initNotif.status).toBe(202)

    const list = await postSse(base, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId)
    expect(list.res.status).toBe(200)
    const tools = (list.messages.find(m => m.id === 2)?.result as { tools: Array<{ name: string }> })?.tools ?? []
    const names = tools.map(t => t.name)
    expect(names).toHaveLength(8)
    expect(names).toEqual(
      expect.arrayContaining([
        'rag_list_kbs',
        'rag_list_documents',
        'rag_search',
        'rag_add_document',
        'rag_delete_document',
        'rag_delete_kb',
        'rag_reindex',
        'rag_status',
      ]),
    )

    const call = await postSse(
      base,
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'rag_list_kbs', arguments: {} } },
      sessionId,
    )
    expect(call.res.status).toBe(200)
    expect(call.messages.find(m => m.id === 3)?.result).toBeTruthy()
  })

  test('should support multiple concurrent sessions without re-initialization errors', async () => {
    const sessionA = await initialize(base)
    const sessionB = await initialize(base)
    expect(sessionA).not.toBe(sessionB)

    const { res: resA } = await postSse(base, { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }, sessionA)
    const { res: resB } = await postSse(base, { jsonrpc: '2.0', id: 6, method: 'tools/list', params: {} }, sessionB)
    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)
    expect(sessions.size).toBe(2)
  })

  test('should reject requests with an unknown session id', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json', Accept: ACCEPT, 'Mcp-Session-Id': 'missing-session' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    expect(res.status).toBe(404)
  })

  test('should reject unauthorized requests', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: ACCEPT },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(res.status).toBe(401)
  })
})
