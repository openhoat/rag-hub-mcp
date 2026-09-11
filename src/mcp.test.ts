import { describe, expect, test, vi } from 'vitest'
import { handleToolCall } from './mcp.js'
import type { Store } from './types.js'

vi.mock('./search.js', () => ({
  search: vi.fn(async () => [{ kb: 'kb', relPath: 'file.md', chunkIndex: 0, content: 'result snippet', score: 0.9 }]),
}))

import { addDocument, deleteDocument, deleteKb } from './ingest.js'

vi.mock('./ingest.js', () => ({
  addDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => {}),
  deleteKb: vi.fn(async () => {}),
  scanAll: vi.fn(async () => ({ added: 1, modified: 0, deleted: 0, skipped: 0 })),
}))

const mockedAdd = vi.mocked(addDocument)
const mockedDelete = vi.mocked(deleteDocument)
const mockedDeleteKb = vi.mocked(deleteKb)

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    db: {} as never,
    close: () => {},
    listKbs: () => [{ name: 'kb', docCount: 1, chunkCount: 2, totalBytes: 42 }],
    listFiles: () => [{ relPath: 'a.md', sha256: 'x', mtime: 1, bytes: 42, chunkCount: 2 }],
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
    ...overrides,
  }
}

function store(listKbs = true, listFiles = true): Store {
  return makeStore({
    listKbs: () => (listKbs ? [{ name: 'kb', docCount: 1, chunkCount: 2, totalBytes: 42 }] : []),
    listFiles: () => (listFiles ? [{ relPath: 'a.md', sha256: 'x', mtime: 1, bytes: 42, chunkCount: 2 }] : []),
  })
}

describe('handleToolCall', () => {
  test('should list knowledge bases', async () => {
    const result = await handleToolCall(store(), 'rag_list_kbs', {})
    expect(result.content?.[0]).toEqual({ type: 'text', text: expect.stringContaining('kb') })
  })

  test('should list documents', async () => {
    const result = await handleToolCall(store(), 'rag_list_documents', { kb: 'kb' })
    expect(result.content?.[0]).toEqual({ type: 'text', text: expect.stringContaining('a.md') })
  })

  test('should search via the search module', async () => {
    const result = await handleToolCall(store(), 'rag_search', { query: 'hello', kb: 'kb' })
    expect(result.content?.[0]).toEqual({ type: 'text', text: expect.stringContaining('result snippet') })
  })

  test('should add a document with sanitized path', async () => {
    const result = await handleToolCall(store(), 'rag_add_document', {
      kb: 'kb',
      path: '../evil.md',
      content: 'x',
    })
    expect(mockedAdd).toHaveBeenCalledWith(expect.anything(), 'kb', 'evil.md', 'x')
    expect(result.content?.[0]).toEqual({ type: 'text', text: expect.stringContaining('evil.md') })
  })

  test('should delete a document', async () => {
    const result = await handleToolCall(store(), 'rag_delete_document', { kb: 'kb', path: 'a.md' })
    expect(mockedDelete).toHaveBeenCalledTimes(1)
    expect(result.content?.[0]).toEqual({ type: 'text', text: 'Document deleted: **kb/a.md**' })
  })

  test('should delete a knowledge base', async () => {
    const result = await handleToolCall(store(), 'rag_delete_kb', { kb: 'kb' })
    expect(mockedDeleteKb).toHaveBeenCalledTimes(1)
    expect(result.content?.[0]).toEqual({ type: 'text', text: 'Knowledge base deleted: **kb**' })
  })

  test('should report status with aggregate stats', async () => {
    const result = await handleToolCall(store(), 'rag_status', {})
    expect(result.content?.[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('**1** knowledge bases, **1** documents, **2** chunks'),
    })
  })

  test('should return unknown tool error', async () => {
    const result = await handleToolCall(store(), 'rag_unknown', {})
    expect(result.isError).toBe(true)
  })
})
