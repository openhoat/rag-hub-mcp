import type { Server as HttpServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { addDocument, deleteDocument, deleteKb, readDocument, scanAll } from '../core/ingest.js'
import { search } from '../core/search.js'
import { makeStubStore, startHttpServer } from '../testing/helpers.js'
import { createRestApp } from './rest.js'

vi.mock('../core/ingest.js', () => ({
  addDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => {}),
  deleteKb: vi.fn(async () => {}),
  readDocument: vi.fn(async () => ({ content: 'extracted text', frontmatter: null })),
  scanAll: vi.fn(async () => ({ added: 1, modified: 0, deleted: 0, skipped: 0 })),
}))
vi.mock('../core/search.js', () => ({
  search: vi.fn(async () => [{ kb: 'kb', relPath: 'f.md', chunkIndex: 0, content: 'hit', score: 0.5 }]),
}))

const mockedAdd = vi.mocked(addDocument)
const mockedDelete = vi.mocked(deleteDocument)
const mockedDeleteKb = vi.mocked(deleteKb)
const mockedScan = vi.mocked(scanAll)
const mockedSearch = vi.mocked(search)
const mockedRead = vi.mocked(readDocument)

const AUTH = { Authorization: 'Bearer test-secret-key' }
const JSON_HEADERS = { 'Content-Type': 'application/json' }

describe('rest', () => {
  let server: HttpServer
  let base: string

  beforeEach(async () => {
    const started = await startHttpServer(await createRestApp(makeStubStore()))
    server = started.server
    base = started.base
  })

  afterEach(() => {
    server?.close()
    vi.clearAllMocks()
  })

  test('GET /health should return ok and version', async () => {
    const res = await fetch(`${base}/health`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  test('GET /admin/kbs should require auth token', async () => {
    let res = await fetch(`${base}/admin/kbs`)
    expect(res.status).toBe(401)
    res = await fetch(`${base}/admin/kbs`, {
      headers: { Authorization: 'Bearer wrong' },
    })
    expect(res.status).toBe(401)
  })

  test('GET /admin/kbs should list kbs with valid token', async () => {
    const res = await fetch(`${base}/admin/kbs`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ name: string }>
    expect(body[0].name).toBe('kb')
  })

  test('GET /search should require query param even when authenticated', async () => {
    const res = await fetch(`${base}/search`, { headers: AUTH })
    expect(res.status).toBe(400)
  })

  test('POST /admin/reindex should force a scan', async () => {
    mockedScan.mockResolvedValueOnce({ added: 1, modified: 0, deleted: 0, skipped: 0 })
    const res = await fetch(`${base}/admin/reindex`, { method: 'POST', headers: AUTH })
    expect(res.status).toBe(200)
    expect(mockedScan).toHaveBeenCalledTimes(1)
  })

  test('GET /search should return results with valid query and kb filter', async () => {
    mockedSearch.mockResolvedValueOnce([{ kb: 'kb', relPath: 'f.md', chunkIndex: 0, content: 'hit', score: 0.5 }])
    const res = await fetch(`${base}/search?query=hello&kb=kb&top_k=5`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: Array<{ relPath: string }> }
    expect(body.results).toHaveLength(1)
    expect(body.results[0].relPath).toBe('f.md')
  })

  test('GET /search should split comma-separated kb into an array', async () => {
    mockedSearch.mockResolvedValueOnce([{ kb: 'kb', relPath: 'f.md', chunkIndex: 0, content: 'hit', score: 0.5 }])
    const res = await fetch(`${base}/search?query=hello&kb=infra,dev`, { headers: AUTH })
    expect(res.status).toBe(200)
    expect(mockedSearch).toHaveBeenCalledWith(expect.anything(), { query: 'hello', kb: ['infra', 'dev'], topK: 10 })
  })

  test('POST /admin/kbs/:kb/documents should add with raw path and string content', async () => {
    mockedAdd.mockResolvedValueOnce()
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: '../evil.md', content: 'hello' }),
    })
    expect(res.status).toBe(200)
    expect(mockedAdd).toHaveBeenCalledWith(expect.anything(), 'docs', '../evil.md', 'hello')
  })

  test('POST /admin/kbs/:kb/documents should reject missing path', async () => {
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ content: 'hello' }),
    })
    expect(res.status).toBe(400)
  })

  test('POST /admin/kbs/:kb/documents should reject missing content', async () => {
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: 'x.md' }),
    })
    expect(res.status).toBe(400)
  })

  test('DELETE /admin/kbs/:kb/documents/:path should delete a document', async () => {
    mockedDelete.mockResolvedValueOnce()
    const res = await fetch(`${base}/admin/kbs/docs/documents/a.md`, { method: 'DELETE', headers: AUTH })
    expect(res.status).toBe(200)
    expect(mockedDelete).toHaveBeenCalled()
  })

  test('DELETE /admin/kbs/:kb should delete a knowledge base', async () => {
    mockedDeleteKb.mockResolvedValueOnce()
    const res = await fetch(`${base}/admin/kbs/docs`, { method: 'DELETE', headers: AUTH })
    expect(res.status).toBe(200)
    expect(mockedDeleteKb).toHaveBeenCalled()
  })

  test('GET /admin/status should return kb list', async () => {
    const res = await fetch(`${base}/admin/status`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { kbs: Array<{ name: string }> }
    expect(body.kbs[0].name).toBe('kb')
  })

  test('GET /document should return extracted content', async () => {
    mockedRead.mockResolvedValueOnce({ content: 'extracted text', frontmatter: null })
    const res = await fetch(`${base}/document?kb=kb&path=notes%2Farch.md`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { content: string; frontmatter: Record<string, string> | null }
    expect(body.content).toBe('extracted text')
    expect(body.frontmatter).toBeNull()
  })

  test('GET /document should return frontmatter metadata when present', async () => {
    mockedRead.mockResolvedValueOnce({ content: 'body', frontmatter: { title: 'Intro', status: 'draft' } })
    const res = await fetch(`${base}/document?kb=kb&path=notes%2Fintro.md`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { content: string; frontmatter: Record<string, string> }
    expect(body.content).toBe('body')
    expect(body.frontmatter).toEqual({ title: 'Intro', status: 'draft' })
  })

  test('GET /document should require kb and path', async () => {
    const res = await fetch(`${base}/document`, { headers: AUTH })
    expect(res.status).toBe(400)
  })

  test('GET /document should return 404 when the document is missing', async () => {
    mockedRead.mockResolvedValueOnce(null)
    const res = await fetch(`${base}/document?kb=kb&path=missing.md`, { headers: AUTH })
    expect(res.status).toBe(404)
  })

  test('GET /document should return 400 on invalid path', async () => {
    mockedRead.mockRejectedValueOnce(new Error('invalid path'))
    const res = await fetch(`${base}/document?kb=kb&path=../evil.md`, { headers: AUTH })
    expect(res.status).toBe(400)
  })

  test('GET /admin/kbs/:kb/documents should list files', async () => {
    const res = await fetch(`${base}/admin/kbs/kb/documents`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ relPath: string }>
    expect(body[0].relPath).toBe('a.md')
  })

  test('POST /admin/reindex should return 500 when scan throws', async () => {
    mockedScan.mockRejectedValueOnce(new Error('boom'))
    const res = await fetch(`${base}/admin/reindex`, { method: 'POST', headers: AUTH })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('internal error')
  })

  test('POST /admin/kbs/:kb/documents should reject non-string content', async () => {
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: 'x.md', content: { nested: 'object' } }),
    })
    expect(res.status).toBe(400)
  })

  test('POST /admin/kbs/:kb/documents should return 400 on invalid path', async () => {
    mockedAdd.mockRejectedValueOnce(new Error('invalid path'))
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: '../evil.md', content: 'hello' }),
    })
    expect(res.status).toBe(400)
  })

  test('POST /admin/kbs/:kb/documents should return 500 when addDocument throws', async () => {
    mockedAdd.mockRejectedValueOnce(new Error('boom'))
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: 'x.md', content: 'hello' }),
    })
    expect(res.status).toBe(500)
  })

  test('should reject malformed JSON body', async () => {
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: '{invalid json',
    })
    expect(res.status).toBe(500)
  })

  test('should decode URL-encoded path in DELETE document', async () => {
    mockedDelete.mockResolvedValueOnce()
    const encoded = encodeURIComponent('notes/my file.md')
    const res = await fetch(`${base}/admin/kbs/docs/documents/${encoded}`, { method: 'DELETE', headers: AUTH })
    expect(res.status).toBe(200)
    expect(mockedDelete).toHaveBeenCalledWith(expect.anything(), 'docs', 'notes/my file.md')
  })

  test('should return 429 on /search when the rate limit is exceeded', async () => {
    process.env.SEARCH_RATE_PER_MINUTE = '1'
    try {
      const started = await startHttpServer(await createRestApp(makeStubStore()))
      const limitedServer = started.server
      const limitedBase = started.base
      try {
        let res = await fetch(`${limitedBase}/search?query=hello`, { headers: AUTH })
        expect(res.status).toBe(200)
        res = await fetch(`${limitedBase}/search?query=again`, { headers: AUTH })
        expect(res.status).toBe(429)
      } finally {
        limitedServer.close()
      }
    } finally {
      delete process.env.SEARCH_RATE_PER_MINUTE
    }
  })
})
