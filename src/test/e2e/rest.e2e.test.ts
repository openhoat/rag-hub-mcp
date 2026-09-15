import { mkdtempSync, rmSync } from 'node:fs'
import type { Server as HttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createSqliteStore } from '../../core/store'
import { createRestApp } from '../../transport/rest'
import type { Store } from '../../types'
import { startHttpServer, stubEmbeddingsApi, unitEmbeddings, writeKbDocument } from '../helpers'

const AUTH = { Authorization: 'Bearer test-secret-key' }
const JSON_HEADERS = { 'Content-Type': 'application/json' }

describe('REST API (real store + ingest + search)', () => {
  let root: string
  let store: Store
  let server: HttpServer
  let base: string
  let restoreFetch: (() => void) | undefined

  beforeEach(async () => {
    restoreFetch = stubEmbeddingsApi(texts => texts.map(() => unitEmbeddings(4)))
    root = mkdtempSync(join(tmpdir(), 'rag-rest-'))
    store = createSqliteStore(join(root, 'rag.db'))
    const started = await startHttpServer(await createRestApp(store))
    server = started.server
    base = started.base
  })

  afterEach(async () => {
    restoreFetch?.()
    server?.close()
    await store?.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  test('should run a full KB lifecycle via the admin and search endpoints', async () => {
    // Add a document
    const addRes = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: 'notes/hello.md', content: 'the quick brown fox jumps' }),
    })
    expect(addRes.status).toBe(200)

    // List docs
    const docsRes = await fetch(`${base}/admin/kbs/docs/documents`, { headers: AUTH })
    expect(docsRes.status).toBe(200)
    const docs = (await docsRes.json()) as Array<{ relPath: string }>
    expect(docs.some(d => d.relPath === 'notes/hello.md')).toBe(true)

    // Search finds it
    const searchRes = await fetch(`${base}/search?query=brown+fox&kb=docs`, { headers: AUTH })
    expect(searchRes.status).toBe(200)
    const searchBody = (await searchRes.json()) as { results: Array<{ kb: string }> }
    expect(searchBody.results.length).toBeGreaterThan(0)
    expect(searchBody.results[0].kb).toBe('docs')

    // Status shows the KB
    const statusRes = await fetch(`${base}/admin/status`, { headers: AUTH })
    const statusBody = (await statusRes.json()) as { kbs: Array<{ name: string }> }
    expect(statusBody.kbs.some(k => k.name === 'docs')).toBe(true)

    // Delete the document
    const encoded = encodeURIComponent('notes/hello.md')
    const delRes = await fetch(`${base}/admin/kbs/docs/documents/${encoded}`, { method: 'DELETE', headers: AUTH })
    expect(delRes.status).toBe(200)

    const searchAfter = await fetch(`${base}/search?query=brown+fox&kb=docs`, { headers: AUTH })
    const afterBody = (await searchAfter.json()) as { results: Array<unknown> }
    expect(afterBody.results).toEqual([])
  })

  test('should reindex files dropped on disk via POST /admin/reindex', async () => {
    writeKbDocument(process.env.KB_ROOT as string, 'rebk', 'ref/api.md', 'restful apis return json responses')
    const reindexRes = await fetch(`${base}/admin/reindex`, { method: 'POST', headers: AUTH })
    expect(reindexRes.status).toBe(200)
    const body = (await reindexRes.json()) as { added: number }
    expect(body.added).toBeGreaterThanOrEqual(0)

    const searchRes = await fetch(`${base}/search?query=json`, { headers: AUTH })
    const searchBody = (await searchRes.json()) as { results: Array<{ relPath: string }> }
    expect(searchBody.results.length).toBeGreaterThan(0)
    expect(searchBody.results[0].relPath).toBe('ref/api.md')
  })

  test('should delete an entire knowledge base', async () => {
    const addRes = await fetch(`${base}/admin/kbs/tmp/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: 'a.md', content: 'some content here' }),
    })
    expect(addRes.status).toBe(200)

    const delRes = await fetch(`${base}/admin/kbs/tmp`, { method: 'DELETE', headers: AUTH })
    expect(delRes.status).toBe(200)

    const docRes = await fetch(`${base}/admin/kbs/tmp/documents`, { headers: AUTH })
    const body = (await docRes.json()) as Array<unknown>
    expect(body).toEqual([])
  })

  test('should reject path traversal in document creation', async () => {
    const addRes = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: '../../evil.md', content: 'escaped content' }),
    })
    expect(addRes.status).toBe(400)

    // The document must not be indexed under the KB root.
    const docsRes = await fetch(`${base}/admin/kbs/docs/documents`, { headers: AUTH })
    const docs = (await docsRes.json()) as Array<{ relPath: string }>
    expect(docs.some(d => d.relPath === 'evil.md')).toBe(false)
  })

  test('should read a document via GET /document', async () => {
    const addRes = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: 'readme.md', content: 'read the full content here' }),
    })
    expect(addRes.status).toBe(200)

    const encoded = encodeURIComponent('readme.md')
    const res = await fetch(`${base}/document?kb=docs&path=${encoded}`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { content: string; frontmatter: Record<string, string> | null }
    expect(body.content).toContain('read the full content here')
    expect(body.frontmatter).toBeNull()
  })

  test('should return frontmatter via GET /document for markdown', async () => {
    const content = '---\ntitle: Report\nstatus: draft\n---\n\n# Report body\n\nparagraph with content'
    const addRes = await fetch(`${base}/admin/kbs/docs/documents`, {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ path: 'report.md', content }),
    })
    expect(addRes.status).toBe(200)

    const res = await fetch(`${base}/document?kb=docs&path=${encodeURIComponent('report.md')}`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { content: string; frontmatter: Record<string, string> }
    expect(body.frontmatter).toEqual({ title: 'Report', status: 'draft' })
    expect(body.content).toContain('paragraph with content')
    expect(body.content).not.toContain('title: Report')
  })

  test('should search across multiple knowledge bases via comma-separated kb', async () => {
    writeKbDocument(process.env.KB_ROOT as string, 'kbAlpha', 'a.md', 'alpha beta shared')
    writeKbDocument(process.env.KB_ROOT as string, 'kbBeta', 'b.md', 'gamma beta shared')
    await fetch(`${base}/admin/reindex`, { method: 'POST', headers: AUTH })

    const res = await fetch(`${base}/search?query=beta&kb=kbAlpha,kbBeta`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: Array<{ kb: string }> }
    expect(body.results.length).toBeGreaterThanOrEqual(1)
  })

  test('should require auth on admin endpoints', async () => {
    const res = await fetch(`${base}/admin/status`)
    expect(res.status).toBe(401)
  })
})
