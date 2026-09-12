import cors from 'cors'
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
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

const auth = (req: Request, res: Response): boolean => {
  if (!MCP_API_KEY) return true
  const header = req.headers.authorization
  if (header !== `Bearer ${MCP_API_KEY}`) {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
  return true
}

const asyncHandler = (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler => {
  return (req, res, next) => {
    handler(req, res, next).catch(next)
  }
}

export const createRestApp = (store: Store) => {
  const app = express()
  if (CORS_ORIGINS.length > 0) {
    app.use(
      cors({
        origin: CORS_ORIGINS,
      }),
    )
  }
  app.use(express.json({ limit: '10mb' }))

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: RAG_VERSION })
  })

  app.get('/admin/kbs', (req: Request, res: Response) => {
    if (!auth(req, res)) return
    res.json(store.listKbs())
  })

  app.get('/admin/kbs/:kb/documents', (req: Request, res: Response) => {
    if (!auth(req, res)) return
    const docs = store.listFiles(req.params.kb)
    res.json(docs)
  })

  app.post(
    '/admin/kbs/:kb/documents',
    asyncHandler(async (req: Request, res: Response) => {
      if (!auth(req, res)) return
      const { kb } = req.params
      const { path: relPath, content } = req.body
      if (!relPath || content === undefined) {
        res.status(400).json({ error: 'path and content required' })
        return
      }
      const safePath = relPath.replaceAll('../', '').replace(/^\/+/, '')
      await addDocument(store, kb, safePath, content)
      res.json({ status: 'added', kb, path: safePath })
    }),
  )

  app.delete(
    '/admin/kbs/:kb/documents/:path(*)',
    asyncHandler(async (req: Request, res: Response) => {
      if (!auth(req, res)) return
      const relPath = decodeURIComponent(req.params.path)
      await deleteDocument(store, req.params.kb, relPath)
      res.json({ status: 'deleted', kb: req.params.kb, path: relPath })
    }),
  )

  app.delete(
    '/admin/kbs/:kb',
    asyncHandler(async (req: Request, res: Response) => {
      if (!auth(req, res)) return
      await deleteKb(store, req.params.kb)
      res.json({ status: 'deleted_kb', kb: req.params.kb })
    }),
  )

  app.post(
    '/admin/reindex',
    asyncHandler(async (req: Request, res: Response) => {
      if (!auth(req, res)) return
      const result = await scanAll(store)
      res.json(result)
    }),
  )

  app.get('/admin/status', (req: Request, res: Response) => {
    if (!auth(req, res)) return
    res.json({ kbs: store.listKbs() })
  })

  app.get(
    '/search',
    asyncHandler(async (req: Request, res: Response) => {
      if (!auth(req, res)) return
      const { query, kb, top_k } = req.query
      if (!query) {
        res.status(400).json({ error: 'query required' })
        return
      }
      const results = await search(store, {
        query: query as string,
        kb: kb as string | undefined,
        topK: top_k ? Number.parseInt(top_k as string, 10) : 10,
      })
      res.json({ results })
    }),
  )

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err)
      return
    }
    log.error('request failed', err)
    res.status(500).json({ error: 'internal error' })
  })

  return app
}
