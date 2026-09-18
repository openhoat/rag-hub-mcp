import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import { corsOrigins, env } from '../config.js'
import { addDocument, deleteDocument, deleteKb, forceReindex, readDocument, scanAll } from '../core/ingest.js'
import { search } from '../core/search.js'
import { getLogger } from '../log.js'
import type { JobQueue, Store } from '../types.js'

const log = getLogger('rest')

const MCP_API_KEY = env.MCP_API_KEY
const VERSION = env.VERSION
const CORS_ORIGINS = corsOrigins

const auth = (req: FastifyRequest, reply: FastifyReply): boolean => {
  if (!MCP_API_KEY) return true
  const header = req.headers.authorization
  if (header !== `Bearer ${MCP_API_KEY}`) {
    void reply.code(401).send({ error: 'unauthorized' })
    return false
  }
  return true
}

const addBodySchema = z.object({
  path: z.string(),
  content: z.string(),
})

type AddBody = z.infer<typeof addBodySchema>

const handleAddDocument = async (
  store: Store,
  queue: JobQueue,
  req: FastifyRequest<{ Params: { kb: string }; Body: AddBody }>,
  reply: FastifyReply,
): Promise<void> => {
  const { kb } = req.params
  const parsed = addBodySchema.safeParse(req.body)
  if (!parsed.success) {
    void reply.code(400).send({ error: 'path and content must be strings' })
    return
  }
  const { path: relPath, content } = parsed.data
  try {
    await addDocument(store, queue, kb, relPath, content)
  } catch (err) {
    if (err instanceof Error && err.message === 'invalid path') {
      void reply.code(400).send({ error: 'invalid path' })
      return
    }
    throw err
  }
  void reply.send({ status: 'queued', kb, path: relPath })
}

const handleGetDocument = async (
  req: FastifyRequest<{ Querystring: { kb: string; path: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { kb, path } = req.query
  if (!kb || !path) {
    void reply.code(400).send({ error: 'kb and path required' })
    return
  }
  try {
    const doc = await readDocument(decodeURIComponent(kb), decodeURIComponent(path))
    if (doc === null) {
      void reply.code(404).send({ error: 'document not found' })
      return
    }
    void reply.send({
      kb,
      path,
      content: doc.content,
      frontmatter: doc.frontmatter,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'invalid path') {
      void reply.code(400).send({ error: 'invalid path' })
      return
    }
    throw err
  }
}

const handleSearch = async (
  store: Store,
  req: FastifyRequest<{
    Querystring: { query?: string; kb?: string; top_k?: string }
  }>,
  reply: FastifyReply,
): Promise<void> => {
  const { query, kb, top_k } = req.query
  if (!query) {
    void reply.code(400).send({ error: 'query required' })
    return
  }
  const kbList = kb
    ? kb
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined
  const results = await search(store, {
    query,
    kb: kbList,
    topK: top_k ? Number.parseInt(top_k, 10) : 10,
  })
  void reply.send({ results })
}

export const createRestApp = async (store: Store, queue: JobQueue) => {
  const app = fastify({ bodyLimit: 10 * 1024 * 1024 })

  if (CORS_ORIGINS.length > 0) {
    await app.register(cors, { origin: CORS_ORIGINS })
  }

  const SEARCH_LIMIT = Number.parseInt(process.env.SEARCH_RATE_PER_MINUTE || '60', 10)
  const REINDEX_LIMIT = Number.parseInt(process.env.REINDEX_RATE_PER_MINUTE || '60', 10)

  await app.register(rateLimit, {
    global: false,
    max: SEARCH_LIMIT,
    timeWindow: 60_000,
  })

  const searchLimiter = {
    config: { rateLimit: { max: SEARCH_LIMIT, timeWindow: 60_000 } },
  }
  const reindexLimiter = {
    config: { rateLimit: { max: REINDEX_LIMIT, timeWindow: 60_000 } },
  }

  app.get('/health', (_req, reply) => {
    void reply.send({ status: 'ok', version: VERSION })
  })

  app.get('/admin/kbs', async (req, reply) => {
    if (!auth(req, reply)) return
    void reply.send(await store.listKbs())
  })

  app.get<{ Params: { kb: string } }>('/admin/kbs/:kb/documents', async (req, reply) => {
    if (!auth(req, reply)) return
    void reply.send(await store.listFiles(req.params.kb))
  })

  app.post<{ Params: { kb: string }; Body: AddBody }>('/admin/kbs/:kb/documents', async (req, reply) => {
    if (!auth(req, reply)) return
    await handleAddDocument(store, queue, req, reply)
  })

  app.delete<{ Params: { kb: string; '*': string } }>('/admin/kbs/:kb/documents/*', async (req, reply) => {
    if (!auth(req, reply)) return
    const relPath = decodeURIComponent(req.params['*'])
    await deleteDocument(store, queue, req.params.kb, relPath)
    void reply.send({ status: 'deleted', kb: req.params.kb, path: relPath })
  })

  app.delete<{ Params: { kb: string } }>('/admin/kbs/:kb', async (req, reply) => {
    if (!auth(req, reply)) return
    await deleteKb(store, queue, req.params.kb)
    void reply.send({ status: 'deleted_kb', kb: req.params.kb })
  })

  app.get<{ Querystring: { kb: string; path: string } }>('/document', async (req, reply) => {
    if (!auth(req, reply)) return
    await handleGetDocument(req, reply)
  })

  app.post<{ Querystring: { force?: string } }>('/admin/reindex', reindexLimiter, async (req, reply) => {
    if (!auth(req, reply)) return
    const force = req.query.force === 'true'
    const result = force ? await forceReindex(store, queue) : await scanAll(store, queue)
    void reply.send(result)
  })

  app.get('/admin/status', async (req, reply) => {
    if (!auth(req, reply)) return
    const kbs = await store.listKbs()
    const queueStats = await queue.stats()
    void reply.send({ kbs, indexer: queueStats })
  })

  app.get('/admin/jobs', async (req, reply) => {
    if (!auth(req, reply)) return
    const stats = await queue.stats()
    const failed = await queue.failedList()
    void reply.send({ stats, failed })
  })

  app.post<{ Params: { id: string } }>('/admin/jobs/:id/retry', async (req, reply) => {
    if (!auth(req, reply)) return
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      void reply.code(400).send({ error: 'invalid job id' })
      return
    }
    await queue.retryJob(id)
    void reply.send({ status: 'retried', id })
  })

  app.get<{ Querystring: { query?: string; kb?: string; top_k?: string } }>('/search', searchLimiter, async (req, reply) => {
    if (!auth(req, reply)) return
    await handleSearch(store, req, reply)
  })

  app.setErrorHandler((err, _req, reply) => {
    if (reply.sent) return
    log.error('request failed', err)
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err ? (err as { statusCode?: number }).statusCode : undefined
    if (statusCode === 429) {
      void reply.code(429).send({ error: 'rate limit exceeded' })
      return
    }
    void reply.code(500).send({ error: 'internal error' })
  })

  return app
}
