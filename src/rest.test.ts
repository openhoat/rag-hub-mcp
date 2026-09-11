import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { addDocument, deleteDocument, deleteKb, scanAll } from './ingest.js'
import { createRestApp } from './rest.js'
import { search } from './search.js'
import type { Store } from './types.js'

vi.mock('./ingest.js', () => ({
  addDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => {}),
  deleteKb: vi.fn(async () => {}),
  scanAll: vi.fn(async () => ({ added: 1, modified: 0, deleted: 0, skipped: 0 })),
}))
vi.mock('./search.js', () => ({
  search: vi.fn(async () => [{ kb: 'kb', relPath: 'f.md', chunkIndex: 0, content: 'hit', score: 0.5 }]),
}))

const mockedAdd = vi.mocked(addDocument)
const mockedDelete = vi.mocked(deleteDocument)
const mockedDeleteKb = vi.mocked(deleteKb)
const mockedScan = vi.mocked(scanAll)
const mockedSearch = vi.mocked(search)

function makeStore(): Store {
  return {
    db: {} as never,
    close: () => {},
    listKbs: () => [{ name: 'kb', docCount: 1, chunkCount: 2, totalBytes: 3 }],
    listFiles: () => [{ relPath: 'a.md', sha256: 'x', mtime: 1, bytes: 3, chunkCount: 1 }],
    getFile: () => null,
    upsertFile: () => 0,
    deleteFile: () => {},
    deleteFilesByKb: () => {},
    getKbId: () => 0,
    addKb: () => {},
    removeKb: () => {},
    insertChunk: () => 0,
    deleteChunks: () => {},
    getAllChunks: () => [],
    purgeKb: () => {},
  }
}

async function startServer(): Promise<{ server: Server; base: string }> {
  const app = createRestApp(makeStore())
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s))
  })
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no port')
  return { server, base: `http://127.0.0.1:${addr.port}` }
}
describe('rest', () => {
  let server: Server
  let base: string

  beforeEach(async () => {
    const started = await startServer()
    server = started.server
    base = started.base
  })

  afterEach(() => {
    server.close()
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
    const res = await fetch(`${base}/admin/kbs`, {
      headers: { Authorization: 'Bearer test-secret-key' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ name: string }>
    expect(body[0].name).toBe('kb')
  })

  test('GET /search should require query param even when authenticated', async () => {
    const res = await fetch(`${base}/search`, {
      headers: { Authorization: 'Bearer test-secret-key' },
    })
    expect(res.status).toBe(400)
  })

  test('POST /admin/reindex should force a scan', async () => {
    mockedScan.mockResolvedValueOnce({ added: 1, modified: 0, deleted: 0, skipped: 0 })
    const res = await fetch(`${base}/admin/reindex`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret-key' },
    })
    expect(res.status).toBe(200)
    expect(mockedScan).toHaveBeenCalledTimes(1)
  })

  test('GET /search should return results with valid query and kb filter', async () => {
    mockedSearch.mockResolvedValueOnce([{ kb: 'kb', relPath: 'f.md', chunkIndex: 0, content: 'hit', score: 0.5 }])
    const res = await fetch(`${base}/search?query=hello&kb=kb&top_k=5`, {
      headers: { Authorization: 'Bearer test-secret-key' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: Array<{ relPath: string }> }
    expect(body.results).toHaveLength(1)
    expect(body.results[0].relPath).toBe('f.md')
  })

  test('POST /admin/kbs/:kb/documents should add and sanitize a path', async () => {
    mockedAdd.mockResolvedValueOnce()
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '../evil.md', content: 'hello' }),
    })
    expect(res.status).toBe(200)
    expect(mockedAdd).toHaveBeenCalledWith(expect.anything(), 'docs', 'evil.md', 'hello')
  })

  test('POST /admin/kbs/:kb/documents should reject missing path', async () => {
    const res = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    })
    expect(res.status).toBe(400)
  })

  test('DELETE /admin/kbs/:kb/documents/:path should delete a document', async () => {
    mockedDelete.mockResolvedValueOnce()
    const res = await fetch(`${base}/admin/kbs/docs/documents/a.md`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-secret-key' },
    })
    expect(res.status).toBe(200)
    expect(mockedDelete).toHaveBeenCalled()
  })

  test('DELETE /admin/kbs/:kb should delete a knowledge base', async () => {
    mockedDeleteKb.mockResolvedValueOnce()
    const res = await fetch(`${base}/admin/kbs/docs`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-secret-key' },
    })
    expect(res.status).toBe(200)
    expect(mockedDeleteKb).toHaveBeenCalled()
  })

  test('GET /admin/status should return kb list', async () => {
    const res = await fetch(`${base}/admin/status`, {
      headers: { Authorization: 'Bearer test-secret-key' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { kbs: Array<{ name: string }> }
    expect(body.kbs[0].name).toBe('kb')
  })

  test('GET /admin/kbs/:kb/documents should list files', async () => {
    const res = await fetch(`${base}/admin/kbs/kb/documents`, {
      headers: { Authorization: 'Bearer test-secret-key' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ relPath: string }>
    expect(body[0].relPath).toBe('a.md')
  })
})
