import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import { addDocument, deleteDocument, deleteKb, readDocument, scanAll } from '../core/ingest.js'
import { search } from '../core/search.js'
import { getLogger } from '../log.js'
import type { Store } from '../types.js'

const log = getLogger('rest')

const MCP_API_KEY = process.env.MCP_API_KEY || ''
const RAG_VERSION = process.env.RAG_VERSION || '0.0.1'
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const auth = (req: FastifyRequest, reply: FastifyReply): boolean => {
  if (!MCP_API_KEY) return true
  const header = req.headers.authorization
  if (header !== `Bearer ${MCP_API_KEY}`) {
    reply.code(401).send({ error: 'unauthorized' })
    return false
  }
  return true
}

const addBodySchema = z.object({
  path: z.string(),
  content: z.string(),
})

type AddBody = z.infer<typeof addBodySchema>

export const createRestApp = async (store: Store) => {
  const app = fastify({ bodyLimit: 10 * 1024 * 1024 })

  if (CORS_ORIGINS.length > 0) {
    await app.register(cors, { origin: CORS_ORIGINS })
  }

  // Per-route rate limiting. Limits are configurable via env so operators can
  // tune them, and so tests can set a tiny limit to trigger a 429 quickly.
  const SEARCH_LIMIT = Number.parseInt(process.env.SEARCH_RATE_PER_MINUTE || '60', 10)
  const REINDEX_LIMIT = Number.parseInt(process.env.REINDEX_RATE_PER_MINUTE || '60', 10)

  // `global: false` so no route is limited implicitly; sensitive routes opt in
  // via `{ config: { rateLimit } }` (search, reindex). `register` MUST be
  // awaited so the plugin's `onRoute` hook attaches before routes are declared
  // — otherwise no rate limit is applied. Health/list endpoints stay unlimited.
  await app.register(rateLimit, { global: false, max: SEARCH_LIMIT, timeWindow: 60_000 })

  const searchLimiter = { config: { rateLimit: { max: SEARCH_LIMIT, timeWindow: 60_000 } } }
  const reindexLimiter = { config: { rateLimit: { max: REINDEX_LIMIT, timeWindow: 60_000 } } }

  app.get('/health', (_req, reply) => {
    reply.send({ status: 'ok', version: RAG_VERSION })
  })

  app.get('/admin/kbs', (req, reply) => {
    if (!auth(req, reply)) return
    reply.send(store.listKbs())
  })

  app.get<{ Params: { kb: string } }>('/admin/kbs/:kb/documents', (req, reply) => {
    if (!auth(req, reply)) return
    reply.send(store.listFiles(req.params.kb))
  })

  app.post<{ Params: { kb: string }; Body: AddBody }>('/admin/kbs/:kb/documents', async (req, reply) => {
    if (!auth(req, reply)) return
    const { kb } = req.params
    const parsed = addBodySchema.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400).send({ error: 'path and content must be strings' })
      return
    }
    const { path: relPath, content } = parsed.data
    try {
      await addDocument(store, kb, relPath, content)
    } catch (err) {
      if (err instanceof Error && err.message === 'invalid path') {
        reply.code(400).send({ error: 'invalid path' })
        return
      }
      throw err
    }
    reply.send({ status: 'added', kb, path: relPath })
  })

  app.delete<{ Params: { kb: string; '*': string } }>('/admin/kbs/:kb/documents/*', async (req, reply) => {
    if (!auth(req, reply)) return
    const relPath = decodeURIComponent(req.params['*'])
    await deleteDocument(store, req.params.kb, relPath)
    reply.send({ status: 'deleted', kb: req.params.kb, path: relPath })
  })

  app.delete<{ Params: { kb: string } }>('/admin/kbs/:kb', async (req, reply) => {
    if (!auth(req, reply)) return
    await deleteKb(store, req.params.kb)
    reply.send({ status: 'deleted_kb', kb: req.params.kb })
  })

  app.get<{ Querystring: { kb: string; path: string } }>('/document', async (req, reply) => {
    if (!auth(req, reply)) return
    const { kb, path } = req.query
    if (!kb || !path) {
      reply.code(400).send({ error: 'kb and path required' })
      return
    }
    try {
      const doc = await readDocument(decodeURIComponent(kb), decodeURIComponent(path))
      if (doc === null) {
        reply.code(404).send({ error: 'document not found' })
        return
      }
      reply.send({ kb, path, content: doc.content, frontmatter: doc.frontmatter })
    } catch (err) {
      if (err instanceof Error && err.message === 'invalid path') {
        reply.code(400).send({ error: 'invalid path' })
        return
      }
      throw err
    }
  })

  app.post('/admin/reindex', reindexLimiter, async (_req, reply) => {
    if (!auth(_req, reply)) return
    const result = await scanAll(store)
    reply.send(result)
  })

  app.get('/admin/status', (req, reply) => {
    if (!auth(req, reply)) return
    reply.send({ kbs: store.listKbs() })
  })

  app.get<{ Querystring: { query?: string; kb?: string; top_k?: string } }>('/search', searchLimiter, async (req, reply) => {
    if (!auth(req, reply)) return
    const { query, kb, top_k } = req.query
    if (!query) {
      reply.code(400).send({ error: 'query required' })
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
    reply.send({ results })
  })

  app.setErrorHandler((err, _req, reply) => {
    if (reply.sent) return
    log.error('request failed', err)
    // Honor the 429 raised by @fastify/rate-limit instead of collapsing it
    // into a generic 500. All other errors keep the generic 500 handling.
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err ? (err as { statusCode?: number }).statusCode : undefined
    if (statusCode === 429) {
      reply.code(429).send({ error: 'rate limit exceeded' })
      return
    }
    reply.code(500).send({ error: 'internal error' })
  })

  return app
}
