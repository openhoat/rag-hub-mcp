#!/usr/bin/env node
import './preload.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { scanAll } from './ingest.js'
import { getLogger } from './log.js'
import { createMcpServer, createStreamableHttpTransport } from './mcp.js'
import { createRestApp } from './rest.js'
import { createStore } from './store.js'
import type { Store } from './types.js'

const logger = getLogger('main')

// Default transport is **stdio** (local MCP agents). Use `--http` (or
// RAG_TRANSPORT=http) to run the HTTP server (REST API + streamable-http MCP).
const isHttp = process.argv.includes('--http') || process.env.RAG_TRANSPORT === 'http'

async function main(): Promise<void> {
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

  // Express app
  const app = createRestApp(store)

  // MCP sessions: one McpServer + transport per client session (keyed by Mcp-Session-Id).
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>()

  function closeSession(sessionId: string) {
    const entry = sessions.get(sessionId)
    if (!entry) return
    sessions.delete(sessionId)
    entry.transport.close().catch(() => {})
    logger.info(`MCP session closed: ${sessionId}`)
  }

  app.post('/mcp', async (req, res) => {
    if (MCP_API_KEY) {
      const auth = req.headers.authorization
      if (auth !== `Bearer ${MCP_API_KEY}`) {
        res.status(401).json({ error: 'unauthorized' })
        return
      }
    }
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    try {
      if (sessionId) {
        // Existing session: route to its dedicated transport.
        const entry = sessions.get(sessionId)
        if (!entry) {
          res.status(404).json({ error: 'unknown session' })
          return
        }
        await entry.transport.handleRequest(req, res, req.body)
        return
      }

      // New session: create a dedicated transport + server, then handle the request.
      // onsessioninitialized fires during handleRequest once the SDK allocates the id.
      const transport = createStreamableHttpTransport({
        onSessionInitialized: id => {
          sessions.set(id, { server, transport })
          logger.info(`MCP session started: ${id}`)
        },
        onSessionClosed: closeSession,
      })
      const server = createMcpServer(store)
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      logger.error('MCP streamable-http error', err instanceof Error ? err.stack : String(err))
      if (!res.headersSent) {
        res.status(500).json({ error: 'mcp error' })
      }
    }
  })

  // List tools endpoint (for MCP inspector)
  app.get('/mcp', (_req, res) => {
    res.json({
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
  app.listen(PORT, () => {
    logger.info(`server listening on port ${PORT}`)
    logger.info(`REST: http://localhost:${PORT}/health`)
    logger.info(`MCP (streamable-http): http://localhost:${PORT}/mcp`)
  })

  registerShutdown(store)
}

function registerShutdown(store: Store): void {
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
