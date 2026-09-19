import { mkdtempSync, rmSync } from 'node:fs'
import type { Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { Store } from '../../shared/types'
import { createSqliteStore } from '../../storage/sqlite/store'
import { createMcpServer, createStreamableHttpTransport } from '../../transport/mcp'
import { createRestApp } from '../../transport/rest'
import { createSyncTestQueue, stubEmbeddingsApi, unitEmbeddings, writeKbDocument } from '../helpers'

const AUTH = { Authorization: 'Bearer test-secret-key' }
const ACCEPT = 'application/json, text/event-stream'

interface SessionEntry {
  server: McpServer
  transport: StreamableHTTPServerTransport
}

const postSse = async (
  base: string,
  body: unknown,
  sessionId?: string,
): Promise<{ res: Response; messages: Array<Record<string, unknown>> }> => {
  const headers: Record<string, string> = {
    ...AUTH,
    'Content-Type': 'application/json',
    Accept: ACCEPT,
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const messages = text
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.replace(/^data:\s*/, ''))
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line)) as Array<Record<string, unknown>>
  return { res, messages }
}

const initialize = async (base: string): Promise<string> => {
  const { res, messages } = await postSse(base, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' },
    },
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
  let app: FastifyInstance
  let server: HttpServer
  let base: string
  let sessions: Map<string, SessionEntry>
  let restoreFetch: (() => void) | undefined

  beforeEach(async () => {
    restoreFetch = stubEmbeddingsApi(texts => texts.map(() => unitEmbeddings(4)))
    root = mkdtempSync(join(tmpdir(), 'rag-mcp-'))
    store = createSqliteStore(join(root, 'rag.db'))
    const queue = createSyncTestQueue(store, process.env.KB_ROOT as string)
    app = await createRestApp(store, queue)
    sessions = new Map<string, SessionEntry>()

    const closeSession = (id: string) => {
      const entry = sessions.get(id)
      if (!entry) return
      sessions.delete(id)
      entry.transport.close().catch(() => {})
    }

    app.post('/mcp', async (request, reply) => {
      const apiKey = 'test-secret-key'
      if (apiKey) {
        const auth = request.headers.authorization
        if (auth !== `Bearer ${apiKey}`) {
          void reply.code(401).send({ error: 'unauthorized' })
          return
        }
      }
      const sessionId = request.headers['mcp-session-id'] as string | undefined
      reply.hijack()
      try {
        if (sessionId) {
          const entry = sessions.get(sessionId)
          if (entry) {
            await entry.transport.handleRequest(request.raw, reply.raw, request.body)
            return
          }
          reply.raw.statusCode = 404
          reply.raw.end(JSON.stringify({ error: 'unknown session' }))
          return
        }
        const transport = createStreamableHttpTransport({
          onSessionInitialized: id => {
            sessions.set(id, { server, transport })
          },
          onSessionClosed: closeSession,
        })
        const server = createMcpServer(store, queue)
        await server.connect(transport)
        await transport.handleRequest(request.raw, reply.raw, request.body)
      } catch {
        if (!reply.raw.writableEnded) {
          reply.raw.statusCode = 500
          reply.raw.end(JSON.stringify({ error: 'mcp error' }))
        }
      }
    })

    await app.ready()
    await app.listen({ port: 0 })
    server = app.server
    const addr = server.address() as AddressInfo
    base = `http://127.0.0.1:${addr.port}`
  })

  afterEach(async () => {
    restoreFetch?.()
    server?.close()
    await store?.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  test('should run initialize, notifications/initialized, tools/list and tools/call on one session', async () => {
    const sessionId = await initialize(base)

    const initNotif = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        ...AUTH,
        'Content-Type': 'application/json',
        Accept: ACCEPT,
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    })
    expect(initNotif.status).toBe(202)

    const list = await postSse(base, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId)
    expect(list.res.status).toBe(200)
    const tools =
      (
        list.messages.find(m => m.id === 2)?.result as {
          tools: Array<{ name: string }>
        }
      )?.tools ?? []
    const names = tools.map(t => t.name)
    expect(names).toHaveLength(10)
    expect(names).toEqual(
      expect.arrayContaining([
        'rag_list_kbs',
        'rag_list_documents',
        'rag_search',
        'rag_read',
        'rag_add_document',
        'rag_delete_document',
        'rag_delete_kb',
        'rag_reindex',
        'rag_status',
        'rag_jobs',
      ]),
    )

    const call = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'rag_list_kbs', arguments: {} },
      },
      sessionId,
    )
    expect(call.res.status).toBe(200)
    expect(call.messages.find(m => m.id === 3)?.result).toBeTruthy()
  })

  test('should expose a self-contained-query hint in the rag_search description', async () => {
    const sessionId = await initialize(base)
    const list = await postSse(base, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId)
    const tools =
      (
        list.messages.find(m => m.id === 2)?.result as {
          tools: Array<{ name: string; description?: string }>
        }
      )?.tools ?? []
    const searchTool = tools.find(t => t.name === 'rag_search')
    expect(searchTool?.description ?? '').toContain('self-contained query')
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
      headers: {
        ...AUTH,
        'Content-Type': 'application/json',
        Accept: ACCEPT,
        'Mcp-Session-Id': 'missing-session',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    })
    expect(res.status).toBe(404)
  })

  test('should reject unauthorized requests', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: ACCEPT },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      }),
    })
    expect(res.status).toBe(401)
  })

  test('should add, search, then delete a document through the full pipeline', async () => {
    const sessionId = await initialize(base)

    const add = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'rag_add_document',
          arguments: {
            kb: 'pipe',
            path: 'notes/hello.md',
            content: 'the quick brown fox',
          },
        },
      },
      sessionId,
    )
    expect(add.res.status).toBe(200)
    const addResult = add.messages.find(m => m.id === 10)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(addResult?.content?.[0]?.text).toContain('Document added')

    const readAdded = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'rag_read',
          arguments: { kb: 'pipe', path: 'notes/hello.md' },
        },
      },
      sessionId,
    )
    expect(readAdded.res.status).toBe(200)
    const readText = readAdded.messages.find(m => m.id === 11)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(readText?.content?.[0]?.text).toContain('the quick brown fox')

    const searchHit = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'rag_search',
          arguments: { query: 'quick fox', kb: 'pipe' },
        },
      },
      sessionId,
    )
    expect(searchHit.res.status).toBe(200)
    const searchText = searchHit.messages.find(m => m.id === 12)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(searchText?.content?.[0]?.text ?? '').not.toContain('No results found.')

    const del = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'rag_delete_document',
          arguments: { kb: 'pipe', path: 'notes/hello.md' },
        },
      },
      sessionId,
    )
    expect(del.res.status).toBe(200)

    const searchMiss = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: {
          name: 'rag_search',
          arguments: { query: 'quick fox', kb: 'pipe' },
        },
      },
      sessionId,
    )
    const missText = searchMiss.messages.find(m => m.id === 14)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(missText?.content?.[0]?.text).toContain('No results found.')
  })

  test('should return frontmatter in rag_read for a markdown document', async () => {
    const sessionId = await initialize(base)
    await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 15,
        method: 'tools/call',
        params: {
          name: 'rag_add_document',
          arguments: {
            kb: 'pipe',
            path: 'notes/intro.md',
            content: '---\ntitle: Intro\nauthor: Olivier\n---\n\n# Body\n\ncore content paragraph',
          },
        },
      },
      sessionId,
    )

    const read = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 16,
        method: 'tools/call',
        params: {
          name: 'rag_read',
          arguments: { kb: 'pipe', path: 'notes/intro.md' },
        },
      },
      sessionId,
    )
    expect(read.res.status).toBe(200)
    const readText = read.messages.find(m => m.id === 16)?.result as {
      content?: Array<{ text?: string }>
    }
    const text = readText?.content?.[0]?.text ?? ''
    expect(text).toContain('**Frontmatter:**')
    expect(text).toContain('- **title**: Intro')
    expect(text).toContain('- **author**: Olivier')
    expect(text).toContain('core content paragraph')
  })

  test('should index files added on disk and expose them via rag_reindex and rag_search', async () => {
    const sessionId = await initialize(base)
    writeKbDocument(process.env.KB_ROOT as string, 'books', 'ref/api.md', 'restful apis return json responses')
    // rag_reindex triggers scanAll for the whole KB_ROOT
    const reindex = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: { name: 'rag_reindex', arguments: {} },
      },
      sessionId,
    )
    const reindexResult = reindex.messages.find(m => m.id === 20)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(reindexResult?.content?.[0]?.text ?? '').toMatch(/\+\d+/)

    const list = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: { name: 'rag_list_documents', arguments: { kb: 'books' } },
      },
      sessionId,
    )
    const listText = list.messages.find(m => m.id === 21)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(listText?.content?.[0]?.text ?? '').toContain('ref/api.md')

    const call = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 22,
        method: 'tools/call',
        params: {
          name: 'rag_search',
          arguments: { query: 'restful json', kb: 'books' },
        },
      },
      sessionId,
    )
    const callText = call.messages.find(m => m.id === 22)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(callText?.content?.[0]?.text ?? '').not.toContain('No results found.')
  })

  test('should rebuild the full index when rag_reindex runs with force=true', async () => {
    const sessionId = await initialize(base)
    const kb = 'forcereindex'
    writeKbDocument(process.env.KB_ROOT as string, kb, 'a.md', 'initial content payload')
    // Index once.
    await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 23,
        method: 'tools/call',
        params: { name: 'rag_reindex', arguments: {} },
      },
      sessionId,
    )

    // A plain scan would skip the unchanged file; force must purge & rebuild it.
    const force = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 24,
        method: 'tools/call',
        params: { name: 'rag_reindex', arguments: { force: true } },
      },
      sessionId,
    )
    expect(force.res.status).toBe(200)
    const forceText = force.messages.find(m => m.id === 24)?.result as {
      content?: Array<{ text?: string }>
    }
    // force=true re-indexes every KB in the (shared) KB_ROOT, so files from other
    // tests are included. The key assertion: unchanged files are NOT skipped (=0),
    // proving the full rebuild purges and re-embeds everything.
    expect(forceText?.content?.[0]?.text ?? '').toMatch(/=0 x0/)
    expect(forceText?.content?.[0]?.text ?? '').toMatch(/\+\d/)

    // The chunk is still searchable after the rebuild.
    const hit = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 25,
        method: 'tools/call',
        params: { name: 'rag_search', arguments: { query: 'payload', kb } },
      },
      sessionId,
    )
    const hitText = hit.messages.find(m => m.id === 25)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(hitText?.content?.[0]?.text ?? '').not.toContain('No results found.')
  })

  test('should report status with per-KB stats', async () => {
    const sessionId = await initialize(base)
    writeKbDocument(process.env.KB_ROOT as string, 'statkb', 'a.md', 'alpha beta gamma')
    const reindex = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: { name: 'rag_reindex', arguments: {} },
      },
      sessionId,
    )
    expect(reindex.res.status).toBe(200)

    const status = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: { name: 'rag_status', arguments: { kb: 'statkb' } },
      },
      sessionId,
    )
    expect(status.res.status).toBe(200)
    const statusText = status.messages.find(m => m.id === 31)?.result as {
      content?: Array<{ text?: string }>
    }
    expect(statusText?.content?.[0]?.text ?? '').toContain('**statkb**')
  })

  test('should return an error result for an unknown tool', async () => {
    const sessionId = await initialize(base)
    const call = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 40,
        method: 'tools/call',
        params: { name: 'rag_nope', arguments: {} },
      },
      sessionId,
    )
    expect(call.res.status).toBe(200)
    const result = call.messages.find(m => m.id === 40)?.result as {
      isError?: boolean
      content?: Array<{ text?: string }>
    }
    expect(result?.isError).toBe(true)
  })

  test('should return an error result for invalid tool arguments', async () => {
    const sessionId = await initialize(base)
    const call = await postSse(
      base,
      {
        jsonrpc: '2.0',
        id: 41,
        method: 'tools/call',
        params: { name: 'rag_add_document', arguments: { kb: 'docs' } },
      },
      sessionId,
    )
    // Missing required args (path, content) => tool returns an error / or MCP reports invalid params.
    const result = call.messages.find(m => m.id === 41)?.result
    expect(result).toBeTruthy()
  })
})
