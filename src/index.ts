#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import rateLimit from '@fastify/rate-limit'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { scanAll } from './indexing/ingest.js'
import { createWorker } from './indexing/worker.js'
import { env, isHttpMode, requireHttpApiKey } from './shared/config.js'
import { getLogger } from './shared/log.js'
import { SessionRegistry } from './shared/session-registry.js'
import type { JobQueue, Store } from './shared/types.js'
import { createJobQueue, createStore } from './storage/factory.js'
import { createMcpServer, createStreamableHttpTransport } from './transport/mcp.js'
import { createRestApp } from './transport/rest.js'

const logger = getLogger('main')

type McpSession = {
  server: McpServer
  transport: StreamableHTTPServerTransport
}

const requestAuthenticated = (authHeader: string | undefined): boolean => {
  const key = env.MCP_API_KEY
  return !key || authHeader === `Bearer ${key}`
}

export const closeSession = (sessions: SessionRegistry<McpSession>, sessionId: string): void => {
  const entry = sessions.get(sessionId)
  if (!entry) return
  sessions.delete(sessionId)
  entry.value.transport.close().catch(() => {})
  logger.info(`MCP session closed: ${sessionId}`)
}

export const handleExistingSession = async (
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

export const handleNewSession = async (
  sessions: SessionRegistry<McpSession>,
  store: Store,
  queue: JobQueue,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  try {
    const server = createMcpServer(store, queue)
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

export const main = async (): Promise<void> => {
  const PORT = env.PORT
  const SCAN_INTERVAL = env.SCAN_INTERVAL
  const MCP_API_KEY = env.MCP_API_KEY
  const MCP_SESSION_TTL_SECONDS = env.MCP_SESSION_TTL_SECONDS
  const MCP_SESSION_MAX = env.MCP_SESSION_MAX
  const MCP_SESSION_CREATE_RATE_PER_MINUTE = env.MCP_SESSION_CREATE_RATE_PER_MINUTE

  if (!requireHttpApiKey(isHttpMode, MCP_API_KEY)) {
    logger.error('HTTP mode requires MCP_API_KEY to be set')
    process.exit(1)
  }

  logger.info(`rag-hub-mcp v${env.VERSION} starting (${isHttpMode ? 'http' : 'stdio'})...`)

  const store = await createStore()
  logger.info('store initialized')

  const queue = await createJobQueue()
  const worker = createWorker(store, queue)
  worker.start()
  logger.info('indexer worker started')

  // Initial scan
  logger.info('initial scan...')
  try {
    const result = await scanAll(store, queue)
    logger.info(
      `initial scan: +${result.added} ~${result.modified} -${result.deleted} =${result.skipped} x${result.excluded} ->${result.enqueued}`,
    )
  } catch (err) {
    logger.error('initial scan failed', err)
  }

  if (!isHttpMode) {
    const server = createMcpServer(store, queue)
    const transport = new StdioServerTransport()
    await server.connect(transport)
    logger.info('rag-hub-mcp (stdio) ready — connect your MCP client')
    registerShutdown(store, worker, queue)
    return
  }

  // HTTP mode
  if (SCAN_INTERVAL > 0) {
    setInterval(async () => {
      try {
        await scanAll(store, queue)
      } catch (err) {
        logger.error('periodic scan failed', err)
      }
    }, SCAN_INTERVAL * 1000)
    logger.info(`periodic scan every ${SCAN_INTERVAL}s`)
  }

  const app = await createRestApp(store, queue)

  const sessions = new SessionRegistry<McpSession>(MCP_SESSION_MAX, MCP_SESSION_TTL_SECONDS * 1000)

  await registerMcpEndpoints(app, sessions, store, queue, {
    createRateLimit: MCP_SESSION_CREATE_RATE_PER_MINUTE,
  })

  await app.listen({ port: Number(PORT), host: '0.0.0.0' })
  logger.info(`server listening on port ${PORT}`)
  logger.info(`REST: http://localhost:${PORT}/health`)
  logger.info(`MCP (streamable-http): http://localhost:${PORT}/mcp`)

  registerShutdown(store, worker, queue)
}

export const registerMcpEndpoints = async (
  app: FastifyInstance,
  sessions: SessionRegistry<McpSession>,
  store: Store,
  queue: JobQueue,
  opts: { createRateLimit: number },
): Promise<void> => {
  await app.register(rateLimit, {
    global: false,
    max: opts.createRateLimit,
    timeWindow: 60_000,
  })

  app.post(
    '/mcp',
    {
      config: { rateLimit: { max: opts.createRateLimit, timeWindow: 60_000 } },
    },
    async (request, reply) => {
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
      await handleNewSession(sessions, store, queue, request, reply)
    },
  )

  app.get('/mcp', (_request, reply) => {
    reply.send({
      name: 'rag-hub-mcp',
      version: env.VERSION,
      tools: [
        'rag_list_kbs',
        'rag_list_documents',
        'rag_search',
        'rag_add_document',
        'rag_read',
        'rag_delete_document',
        'rag_delete_kb',
        'rag_reindex',
        'rag_status',
        'rag_jobs',
      ],
    })
  })

  setInterval(() => {
    const expired = sessions.purgeExpired()
    for (const id of expired) closeSession(sessions, id)
    if (expired.length > 0) logger.info(`evicted ${expired.length} stale MCP session(s)`)
  }, 60_000).unref()
}

export const registerShutdown = (store: Store, worker: { stop: () => Promise<void> }, queue: JobQueue): void => {
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`)
    void (async () => {
      try {
        await worker.stop()
      } catch {
        /* ignore */
      }
      try {
        await store.close()
      } catch {
        /* ignore */
      }
      try {
        await queue.close()
      } catch {
        /* ignore */
      }
      process.exit(0)
    })()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

const isEntryPoint = (): boolean => {
  const arg = process.argv[1]
  if (!arg) return false
  try {
    return import.meta.url === pathToFileURL(arg).href
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  try {
    await main()
  } catch (err) {
    logger.error('fatal', err)
    process.exit(1)
  }
}
