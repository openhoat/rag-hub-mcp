#!/usr/bin/env node
import rateLimit from '@fastify/rate-limit'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { env, isHttpMode, requireHttpApiKey } from './config.js'
import { scanAll } from './core/ingest.js'
import { SessionRegistry } from './core/sessionRegistry.js'
import { createStore } from './core/storeFactory.js'
import { getLogger } from './log.js'
import { createMcpServer, createStreamableHttpTransport } from './transport/mcp.js'
import { createRestApp } from './transport/rest.js'
import type { Store } from './types.js'

const logger = getLogger('main')

type McpSession = { server: McpServer; transport: StreamableHTTPServerTransport }

const requestAuthenticated = (authHeader: string | undefined): boolean => {
  const key = env.MCP_API_KEY
  return !key || authHeader === `Bearer ${key}`
}

const closeSession = (sessions: SessionRegistry<McpSession>, sessionId: string): void => {
  const entry = sessions.get(sessionId)
  if (!entry) return
  sessions.delete(sessionId)
  entry.value.transport.close().catch(() => {})
  logger.info(`MCP session closed: ${sessionId}`)
}

const handleExistingSession = async (
  sessions: SessionRegistry<McpSession>,
  sessionId: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const entry = sessions.get(sessionId)
  if (!entry) {
    reply.raw.statusCode = 404
    reply.raw.end(JSON.stringify({ error: 'unknown session' }))
    return
  }
  sessions.touch(sessionId)
  await entry.value.transport.handleRequest(request.raw, reply.raw, request.body)
}

const handleNewSession = async (
  sessions: SessionRegistry<McpSession>,
  store: Store,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  try {
    const server = createMcpServer(store)
    const transport = createStreamableHttpTransport({
      onSessionInitialized: id => {
        sessions.set(id, { server, transport })
        logger.info(`MCP session started: ${id}`)
      },
      onSessionClosed: sessionId => closeSession(sessions, sessionId),
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
}

const main = async (): Promise<void> => {
  const PORT = env.PORT
  const SCAN_INTERVAL = env.SCAN_INTERVAL
  const MCP_API_KEY = env.MCP_API_KEY
  // Session lifecycle bounds (HTTP mode only). TTL seconds = idle cutoff: a
  // client that disconnects without a closing POST /mcp leaves an orphaned
  // session otherwise, which would leak memory. Max sessions caps concurrent
  // clients when the rate-limited creation is not enough.
  const MCP_SESSION_TTL_SECONDS = env.MCP_SESSION_TTL_SECONDS
  const MCP_SESSION_MAX = env.MCP_SESSION_MAX
  // New-session creation rate limit (POST /mcp without Mcp-Session-Id).
  const MCP_SESSION_CREATE_RATE_PER_MINUTE = env.MCP_SESSION_CREATE_RATE_PER_MINUTE

  // Fail fast when HTTP mode is requested without an API key: without it the
  // REST admin endpoints, /search and /mcp would be exposed with no Bearer auth.
  if (!requireHttpApiKey(isHttpMode, MCP_API_KEY)) {
    logger.error('HTTP mode requires MCP_API_KEY to be set')
    process.exit(1)
  }

  logger.info(`rag-hub-mcp v${env.VERSION} starting (${isHttpMode ? 'http' : 'stdio'})...`)

  const store = await createStore()
  logger.info('store initialized')

  // Initial scan
  logger.info('initial scan...')
  try {
    const result = await scanAll(store)
    logger.info(`initial scan: +${result.added} ~${result.modified} -${result.deleted} =${result.skipped}`)
  } catch (err) {
    logger.error('initial scan failed', err)
  }

  if (!isHttpMode) {
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
  const app = await createRestApp(store)

  // MCP sessions: one McpServer + transport per client session (keyed by Mcp-Session-Id).
  // Registry enforces a max concurrent size and an idle TTL, purging orphaned
  // sessions when a client disconnects without a closing POST /mcp.
  const sessions = new SessionRegistry<McpSession>(MCP_SESSION_MAX, MCP_SESSION_TTL_SECONDS * 1000)

  await registerMcpEndpoints(app, sessions, store, { createRateLimit: MCP_SESSION_CREATE_RATE_PER_MINUTE })

  // Start server
  await app.listen({ port: Number(PORT) })
  logger.info(`server listening on port ${PORT}`)
  logger.info(`REST: http://localhost:${PORT}/health`)
  logger.info(`MCP (streamable-http): http://localhost:${PORT}/mcp`)

  registerShutdown(store)
}

const registerMcpEndpoints = async (
  app: FastifyInstance,
  sessions: SessionRegistry<McpSession>,
  store: Store,
  opts: { createRateLimit: number },
): Promise<void> => {
  // Rate-limit MCP session *creation* (POST /mcp without a Mcp-Session-Id).
  // Established sessions are unaffected so active clients never hit the cap.
  // `global` limits only this route via the `onRoute` config hook; the plugin
  // provides the `rateLimit` instance for it.
  await app.register(rateLimit, { global: false, max: opts.createRateLimit, timeWindow: 60_000 })

  app.post('/mcp', { config: { rateLimit: { max: opts.createRateLimit, timeWindow: 60_000 } } }, async (request, reply) => {
    if (!requestAuthenticated(request.headers.authorization)) {
      void reply.code(401).send({ error: 'unauthorized' })
      return
    }
    const sessionId = request.headers['mcp-session-id'] as string | undefined
    reply.hijack()
    if (sessionId) {
      await handleExistingSession(sessions, sessionId, request, reply)
      return
    }
    if (!sessions.hasCapacity()) {
      reply.raw.statusCode = 503
      reply.raw.end(JSON.stringify({ error: 'too many MCP sessions' }))
      return
    }
    await handleNewSession(sessions, store, request, reply)
  })

  // List tools endpoint (for MCP inspector)
  app.get('/mcp', (_request, reply) => {
    reply.send({
      name: 'rag-hub-mcp',
      version: env.VERSION,
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

  // Periodic TTL sweep: evict sessions idle beyond MCP_SESSION_TTL_SECONDS and
  // close their transports, so a client that disconnects without a closing
  // POST /mcp cannot leak memory indefinitely.
  setInterval(() => {
    const expired = sessions.purgeExpired()
    for (const id of expired) closeSession(sessions, id)
    if (expired.length > 0) logger.info(`evicted ${expired.length} stale MCP session(s)`)
  }, 60_000).unref()
}

const registerShutdown = (store: Store): void => {
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`)
    void (async () => {
      try {
        await store.close()
      } finally {
        process.exit(0)
      }
    })()
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
