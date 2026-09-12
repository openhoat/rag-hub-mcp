#!/usr/bin/env node
import './preload.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { scanAll } from './core/ingest.js'
import { createStore } from './core/store.js'
import { getLogger } from './log.js'
import { createMcpServer, createStreamableHttpTransport } from './transport/mcp.js'
import { createRestApp } from './transport/rest.js'
import type { Store } from './types.js'

const logger = getLogger('main')

// Default transport is **stdio** (local MCP agents). Use `--http` (or
// RAG_TRANSPORT=http) to run the HTTP server (REST API + streamable-http MCP).
const isHttp = process.argv.includes('--http') || process.env.RAG_TRANSPORT === 'http'

const main = async (): Promise<void> => {
  const PORT = process.env.PORT || '8000'
  const DB_PATH = process.env.DB_PATH || (isHttp ? '/data/index/rag.db' : './rag.db')
  const SCAN_INTERVAL = Number.parseInt(process.env.SCAN_INTERVAL || '300', 10)
  const MCP_API_KEY = process.env.MCP_API_KEY || ''

  logger.info(`rag-hub-mcp v${process.env.RAG_VERSION || '0.0.1'} starting (${isHttp ? 'http' : 'stdio'})...`)

  const store = createStore(DB_PATH)
  logger.info('store initialized')

  // Initial scan
  logger.info('initial scan...')
  try {
    const result = await scanAll(store)
    logger.info(`initial scan: +${result.added} ~${result.modified} -${result.deleted} =${result.skipped}`)
  } catch (err) {
    logger.error('initial scan failed', err)
  }

  if (!isHttp) {
    // stdio transport: serve MCP tools on stdin/stdout for a local agent.
    const server = createMcpServer(store)
    const transport = new StdioServerTransport()
    await server.connect(transport)
    logger.info('rag-hub-mcp (stdio) ready — connect your MCP client')
    registerShutdown(store)
    return
  }

  // HTTP mode: REST API + MCP (streamable-http).
  // Periodic scan
  if (SCAN_INTERVAL > 0) {
    setInterval(async () => {
      try {
        await scanAll(store)
      } catch (err) {
        logger.error('periodic scan failed', err)
      }
    }, SCAN_INTERVAL * 1000)
    logger.info(`periodic scan every ${SCAN_INTERVAL}s`)
  }

  // Fastify app (REST + streamable-http MCP on the same instance).
  const app = createRestApp(store)

  // MCP sessions: one McpServer + transport per client session (keyed by Mcp-Session-Id).
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>()

  const closeSession = (sessionId: string) => {
    const entry = sessions.get(sessionId)
    if (!entry) return
    sessions.delete(sessionId)
    entry.transport.close().catch(() => {})
    logger.info(`MCP session closed: ${sessionId}`)
  }

  app.post('/mcp', async (request, reply) => {
    if (MCP_API_KEY) {
      const auth = request.headers.authorization
      if (auth !== `Bearer ${MCP_API_KEY}`) {
        reply.code(401).send({ error: 'unauthorized' })
        return
      }
    }
    const sessionId = request.headers['mcp-session-id'] as string | undefined
    try {
      // The SDK writes directly to the Node.js raw response (SSE + JSON-RPC).
      // Take over the reply lifecycle before handing off the raw objects.
      reply.hijack()
      if (sessionId) {
        // Existing session: route to its dedicated transport.
        const entry = sessions.get(sessionId)
        if (entry) {
          await entry.transport.handleRequest(request.raw, reply.raw, request.body)
          return
        }
        reply.raw.statusCode = 404
        reply.raw.end(JSON.stringify({ error: 'unknown session' }))
        return
      }

      // New session: create a dedicated transport + server, then handle the request.
      // onsessioninitialized fires during handleRequest once the SDK allocates the id.
      const server = createMcpServer(store)
      const transport = createStreamableHttpTransport({
        onSessionInitialized: id => {
          sessions.set(id, { server, transport })
          logger.info(`MCP session started: ${id}`)
        },
        onSessionClosed: closeSession,
      })
      await server.connect(transport)
      await transport.handleRequest(request.raw, reply.raw, request.body)
    } catch (err) {
      logger.error('MCP streamable-http error', err instanceof Error ? err.stack : String(err))
      if (!reply.raw.writableEnded) {
        reply.raw.statusCode = 500
        reply.raw.end(JSON.stringify({ error: 'mcp error' }))
      }
    }
  })

  // List tools endpoint (for MCP inspector)
  app.get('/mcp', (_request, reply) => {
    reply.send({
      name: 'rag-hub-mcp',
      version: process.env.RAG_VERSION || '0.0.1',
      tools: [
        'rag_list_kbs',
        'rag_list_documents',
        'rag_search',
        'rag_add_document',
        'rag_delete_document',
        'rag_delete_kb',
        'rag_reindex',
        'rag_status',
      ],
    })
  })

  // Start server
  await app.listen({ port: Number(PORT) })
  logger.info(`server listening on port ${PORT}`)
  logger.info(`REST: http://localhost:${PORT}/health`)
  logger.info(`MCP (streamable-http): http://localhost:${PORT}/mcp`)

  registerShutdown(store)
}

const registerShutdown = (store: Store): void => {
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`)
    store.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

try {
  await main()
} catch (err) {
  logger.error('fatal', err)
  process.exit(1)
}
