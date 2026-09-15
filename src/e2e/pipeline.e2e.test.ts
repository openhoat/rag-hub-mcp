import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { deleteDocument, scanAll } from '../core/ingest.js'
import { search } from '../core/search.js'
import { createSqliteStore } from '../core/store.js'
import { stubEmbeddingsApi, unitEmbeddings, writeKbDocument } from '../testing/helpers.js'
import type { Store } from '../types.js'

describe('full pipeline: disk -> scan -> extract -> chunk -> embed -> index -> search', () => {
  let root: string
  let store: Store
  let restoreFetch: (() => void) | undefined

  beforeEach(() => {
    restoreFetch = stubEmbeddingsApi(texts => texts.map(() => unitEmbeddings(4)))
  })

  afterEach(async () => {
    restoreFetch?.()
    await store?.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  const setup = () => {
    root = mkdtempSync(join(tmpdir(), 'rag-pipeline-'))
    const dir = mkdtempSync(join(tmpdir(), 'rag-pipeline-db-'))
    store = createSqliteStore(join(dir, 'rag.db'))
  }

  test('should index real text files on scan and return them via search', async () => {
    setup()
    writeKbDocument(root, 'kb1', 'guide/install.md', '# Install\nrun npm install to set up the project dependencies')
    writeKbDocument(root, 'kb1', 'guide/usage.md', 'start the server then open the dashboard')

    const result = await scanAll(store, root)
    expect(result.added).toBe(2)

    const kbs = await store.listKbs()
    expect(kbs).toHaveLength(1)
    expect(kbs[0].name).toBe('kb1')
    expect(kbs[0].docCount).toBe(2)

    const found = await search(store, { query: 'install set up', kb: 'kb1', topK: 5 })
    expect(found.length).toBeGreaterThan(0)
    expect(found[0].kb).toBe('kb1')
  })

  test('should reindex new files added to disk after initial scan', async () => {
    setup()
    writeKbDocument(root, 'kb1', 'a.md', 'alpha beta gamma')
    await scanAll(store, root)
    writeKbDocument(root, 'kb1', 'b.md', 'delta epsilon zeta')

    const first = await scanAll(store, root)
    expect(first.added).toBe(1)

    const found = await search(store, { query: 'delta', kb: 'kb1', topK: 5 })
    expect(found.length).toBeGreaterThan(0)
  })

  test('should remove a deleted file from the index', async () => {
    setup()
    writeKbDocument(root, 'kb1', 'a.md', 'content to find here')
    await scanAll(store, root)
    await deleteDocument(store, 'kb1', 'a.md', root)

    const found = await search(store, { query: 'content', kb: 'kb1', topK: 5 })
    expect(found).toHaveLength(0)
  })

  test('should return the correct chunk for a long document', async () => {
    setup()
    // Short paragraphs; each begins with a unique token so the FTS keyword
    // match reliably surfaces that chunk even though the content is capped.
    writeKbDocument(root, 'kb1', 'long.md', Array.from({ length: 30 }, (_, i) => `needle${i} filler words for paragraph ${i}`).join('\n\n'))
    await scanAll(store, root)

    const found = await search(store, { query: 'needle25', kb: 'kb1', topK: 5 })
    expect(found.length).toBeGreaterThan(0)
    expect(found[0].content).toContain('needle25')
  })

  test('should not return results from a different knowledge base', async () => {
    setup()
    writeKbDocument(root, 'kbA', 'a.md', 'shared topic discussed here')
    writeKbDocument(root, 'kbB', 'b.md', 'shared topic in another base')
    await scanAll(store, root)

    const allResults = await search(store, { query: 'shared topic', topK: 10 })
    expect(allResults.length).toBeGreaterThan(0)

    const filteredA = await search(store, { query: 'shared topic', kb: 'kbA', topK: 10 })
    expect(filteredA.length).toBeGreaterThan(0)
    expect(filteredA.every(r => r.kb === 'kbA')).toBe(true)

    const filteredB = await search(store, { query: 'shared topic', kb: 'kbB', topK: 10 })
    expect(filteredB.every(r => r.kb === 'kbB')).toBe(true)
  })
})
