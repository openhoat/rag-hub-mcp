import cors from '@fastify/cors'
import fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import { addDocument, deleteDocument, deleteKb, scanAll } from '../core/ingest.js'
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

export const createRestApp = (store: Store) => {
  const app = fastify({ bodyLimit: 10 * 1024 * 1024 })

  if (CORS_ORIGINS.length > 0) {
    app.register(cors, { origin: CORS_ORIGINS })
  }

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

  app.post('/admin/reindex', async (_req, reply) => {
    if (!auth(_req, reply)) return
    const result = await scanAll(store)
    reply.send(result)
  })

  app.get('/admin/status', (req, reply) => {
    if (!auth(req, reply)) return
    reply.send({ kbs: store.listKbs() })
  })

  app.get<{ Querystring: { query?: string; kb?: string; top_k?: string } }>('/search', async (req, reply) => {
    if (!auth(req, reply)) return
    const { query, kb, top_k } = req.query
    if (!query) {
      reply.code(400).send({ error: 'query required' })
      return
    }
    const results = await search(store, {
      query,
      kb,
      topK: top_k ? Number.parseInt(top_k, 10) : 10,
    })
    reply.send({ results })
  })

  app.setErrorHandler((err, _req, reply) => {
    if (reply.sent) return
    log.error('request failed', err)
    reply.code(500).send({ error: 'internal error' })
  })

  return app
}
