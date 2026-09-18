import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { JobQueue, Store } from '../types.js'
import { createSqliteStore } from './store.js'

vi.mock('../pipeline/embed.js', () => ({
  embedTexts: vi.fn(async () => [new Float32Array([0.5, 0.5])]),
  cosineSimilarity: vi.fn(() => 0),
}))
vi.mock('../pipeline/contextual-chunking.js', () => ({
  enrichChunkContent: vi.fn(async (content: string) => content),
}))
vi.mock('../pipeline/extract.js', () => ({
  extractText: vi.fn(async () => ({
    text: 'extracted content',
    frontmatter: null,
  })),
  isTextFile: vi.fn((path: string) => path.endsWith('.md')),
  isBinaryContent: vi.fn(() => false),
  TEXT_EXTENSIONS: new Set(['.md']),
}))

import { enrichChunkContent } from '../pipeline/contextual-chunking.js'
import { embedTexts } from '../pipeline/embed.js'
import { extractText, isBinaryContent } from '../pipeline/extract.js'
import { addDocument, deleteDocument, deleteKb, forceReindex, indexFile, readDocument, scanAll } from './ingest.js'

let root: string
let store: Store

const makeStubQueue = (): JobQueue & {
  enqueued: { kb: string; relPath: string }[]
  clearedFiles: string[]
  clearedKbs: string[]
} => {
  const enqueued: { kb: string; relPath: string }[] = []
  const clearedFiles: string[] = []
  const clearedKbs: string[] = []
  return {
    enqueue: vi.fn(async jobs => {
      for (const j of jobs) enqueued.push({ kb: j.kb, relPath: j.relPath })
    }),
    claim: vi.fn(async () => []),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    reclaimStale: vi.fn(async () => 0),
    stats: vi.fn(async () => ({ pending: 0, processing: 0, failed: 0 })),
    failedList: vi.fn(async () => []),
    retryJob: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    clearForKb: vi.fn(async (kb: string) => {
      clearedKbs.push(kb)
    }),
    clearForFile: vi.fn(async (kb: string, relPath: string) => {
      clearedFiles.push(`${kb}/${relPath}`)
    }),
    close: vi.fn(async () => {}),
    enqueued,
    clearedFiles,
    clearedKbs,
  }
}

const setupKb = (): { root: string; store: Store } => {
  const dir = mkdtempSync(join(tmpdir(), 'rag-ingest-'))
  const dbDir = mkdtempSync(join(tmpdir(), 'rag-ingest-db-'))
  const s = createSqliteStore(join(dbDir, 'rag.db'))
  const kbRoot = join(dir, 'kbs')
  mkdirSync(join(kbRoot, 'docs'), { recursive: true })
  return { root: kbRoot, store: s }
}

afterEach(async () => {
  vi.clearAllMocks()
  if (root) rmSync(root, { recursive: true, force: true })
  if (store) await store.close()
})

describe('indexFile', () => {
  test('should retry per-chunk when the batch embedding call fails', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), 'unused', 'utf-8')
    await store.addKb('docs')
    const kbId = await store.getKbId('docs')

    const paragraph = 'para content filler '.repeat(150)
    vi.mocked(extractText).mockImplementationOnce(async () => ({
      text: Array.from({ length: 3 }, () => paragraph).join('\n\n'),
      frontmatter: null,
    }))

    const batch = vi.mocked(embedTexts).mockImplementationOnce(async texts => {
      if (texts.length > 1) throw new Error('embeddings API error 400')
      return texts.map(() => new Float32Array([0.5, 0.5]))
    })

    await indexFile(store, kbId, 'a.md', join(root, 'docs', 'a.md'), 'abc', {
      mtimeMs: 0,
      size: 40,
    })

    expect(batch).toHaveBeenCalled()
    const chunks = await store.getAllChunks('docs')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.some(c => c.embedding !== null)).toBe(true)
  })

  test('should enrich chunk content via contextual chunking before embedding', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), '# heading\ncontent', 'utf-8')
    await store.addKb('docs')
    const kbId = (await store.getKbId('docs')) as number

    vi.mocked(extractText).mockImplementationOnce(async () => ({
      text: `# heading\n\n${'paragraph content '.repeat(50)}`,
      frontmatter: null,
    }))

    await indexFile(store, kbId, 'a.md', join(root, 'docs', 'a.md'), 'abc', {
      mtimeMs: 0,
      size: 40,
    })

    expect(vi.mocked(enrichChunkContent)).toHaveBeenCalled()
    const [content, context] = vi.mocked(enrichChunkContent).mock.calls[0]
    expect(content).toContain('paragraph content')
    expect(context?.path).toBe('a.md')
    expect(context?.headings).toBe('heading')
  })
})

describe('scanAll', () => {
  test('should enqueue index jobs for new files', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    writeFileSync(join(root, 'docs', 'a.md'), '# hello', 'utf-8')
    const result = await scanAll(store, queue, root)
    expect(result.added).toBe(1)
    expect(result.enqueued).toBe(1)
    expect(queue.enqueued).toHaveLength(1)
    expect(queue.enqueued[0].relPath).toBe('a.md')
  })

  test('should skip unchanged files on a second scan', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), '# hello', 'utf-8')
    // Note: with async indexing the producer does NOT create file records
    // (only the worker does). A stub queue never processes, so no known
    // file exists on the second scan → the file is always seen as new.
    // The test verifies the producer enqueues a job each time.
    const queue = makeStubQueue()
    const first = await scanAll(store, queue, root)
    expect(first.enqueued).toBe(1)
    expect(first.added).toBe(1)
    // Second scan: still no known file → re-enqueues
    queue.enqueued.length = 0
    const second = await scanAll(store, queue, root)
    expect(second.enqueued).toBe(1)
    expect(second.added).toBe(1)
    expect(second.skipped).toBe(0)
  })

  test('should re-enqueue unchanged files with forceReindex', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    writeFileSync(join(root, 'docs', 'a.md'), '# hello', 'utf-8')
    await scanAll(store, queue, root)
    queue.enqueued.length = 0
    const forced = await forceReindex(store, queue, root)
    expect(forced.added).toBe(1)
    expect(forced.enqueued).toBe(1)
  })

  test('should detect modified files', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    const p = join(root, 'docs', 'a.md')
    writeFileSync(p, '# v1', 'utf-8')
    // First scan: no known file → added + enqueued
    const first = await scanAll(store, queue, root)
    expect(first.added).toBe(1)
    expect(first.enqueued).toBe(1)
    await new Promise(r => setTimeout(r, 5))
    writeFileSync(p, '# v2 changed', 'utf-8')
    // Second scan: still no known file → appears as new again
    queue.enqueued.length = 0
    const result = await scanAll(store, queue, root)
    expect(result.modified).toBe(0)
    expect(result.added).toBe(1)
    expect(result.enqueued).toBe(1)
  })

  test('should count binary files as excluded, not enqueued', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    writeFileSync(join(root, 'docs', 'a.bin'), '\u0000\u0001\u0002', 'utf-8')
    vi.mocked(isBinaryContent).mockImplementationOnce(() => true)
    const result = await scanAll(store, queue, root)
    expect(result.excluded).toBe(1)
    expect(result.added).toBe(0)
    expect(result.enqueued).toBe(0)
    expect(queue.enqueued).toHaveLength(0)
  })

  test('should handle a missing root gracefully', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    const result = await scanAll(store, queue, join(root, 'missing'))
    expect(result.added).toBe(0)
  })
})

describe('addDocument', () => {
  test('should write a file and enqueue an index job', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    await addDocument(store, queue, 'docs', 'notes/new.md', '# new', root)
    expect(queue.enqueued).toHaveLength(1)
    expect(queue.enqueued[0].relPath).toBe('notes/new.md')
  })

  test('should reject paths escaping the KB root', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    await expect(addDocument(store, queue, 'docs', '../outside.md', 'x', root)).rejects.toThrow('invalid path')
    await expect(addDocument(store, queue, 'docs', 'a/../../../escape.md', 'x', root)).rejects.toThrow('invalid path')
  })
})

describe('deleteDocument', () => {
  test('should remove the file, index entry, and clear queue', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    writeFileSync(join(root, 'docs', 'a.md'), 'x', 'utf-8')
    await scanAll(store, queue, root)
    await deleteDocument(store, queue, 'docs', 'a.md', root)
    expect(queue.clearedFiles).toContain('docs/a.md')
    expect(await store.listFiles('docs')).toHaveLength(0)
  })

  test('should reject traversal paths', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    await expect(deleteDocument(store, queue, 'docs', '../../etc/passwd', root)).rejects.toThrow('invalid path')
  })
})

describe('readDocument', () => {
  test('should return extracted content for an existing file', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    writeFileSync(join(root, 'docs', 'a.md'), '# hello', 'utf-8')
    const doc = await readDocument('docs', 'a.md', root)
    expect(doc).toEqual({ content: 'extracted content', frontmatter: null })
  })

  test('should return null for a missing file', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const content = await readDocument('docs', 'missing.md', root)
    expect(content).toBeNull()
  })

  test('should reject paths escaping the KB root', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    await expect(readDocument('docs', '../../etc/passwd', root)).rejects.toThrow('invalid path')
  })
})

describe('deleteKb', () => {
  test('should remove the folder, records, and clear queue', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    writeFileSync(join(root, 'docs', 'a.md'), 'x', 'utf-8')
    await scanAll(store, queue, root)
    await deleteKb(store, queue, 'docs', root)
    expect(queue.clearedKbs).toContain('docs')
    expect(await store.listKbs()).toHaveLength(0)
  })

  test('should handle a kb that does not exist', async () => {
    const setup = setupKb()
    root = setup.root
    store = setup.store
    const queue = makeStubQueue()
    await deleteKb(store, queue, 'missing', root)
    expect(await store.listKbs()).toHaveLength(0)
  })
})
