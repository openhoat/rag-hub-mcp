import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { env } from '../config.js'
import { addDocument, deleteDocument, deleteKb, readDocument, scanAll } from '../core/ingest.js'
import { search } from '../core/search.js'
import type { Store } from '../types.js'

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const VERSION = env.VERSION

const kbArgs = { kb: z.string().describe('Knowledge base name') }
const searchArgs = {
  query: z.string().describe('Natural language query'),
  kb: z.string().optional().describe('Knowledge base name(s), comma-separated for multiple (eg "infra,dev"). Omit to search all.'),
  top_k: z.number().optional().describe('Number of results (default 10)'),
}

/**
 * Split a comma-separated `kb` string into a normalized list. Undefined/empty
 * yields undefined (search all); the SDK passes raw (untransformed) args to
 * handleToolCall, so the split happens here rather than in the zod schema.
 */
const normalizeKb = (kb: string | undefined): string[] | undefined => {
  if (!kb) return undefined
  const names = kb
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return names.length > 0 ? names : undefined
}
const addDocArgs = {
  kb: z.string().describe('Knowledge base name'),
  path: z.string().describe('Relative path in KB (eg notes/architecture.md)'),
  content: z.string().describe('Text or markdown content'),
}
const deleteDocArgs = {
  kb: z.string().describe('Knowledge base name'),
  path: z.string().describe('Document relative path'),
}
const readArgs = {
  kb: z.string().describe('Knowledge base name'),
  path: z.string().describe('Document relative path'),
}

export const createMcpServer = (store: Store): McpServer => {
  const server = new McpServer({ name: 'rag-hub-mcp', version: VERSION }, { capabilities: { tools: {} } })

  server.registerTool('rag_list_kbs', { description: 'List available knowledge bases with stats' }, async () =>
    handleToolCall(store, 'rag_list_kbs', {}),
  )

  server.registerTool('rag_list_documents', { description: 'List documents in a knowledge base', inputSchema: kbArgs }, async args =>
    handleToolCall(store, 'rag_list_documents', args),
  )

  server.registerTool(
    'rag_search',
    {
      description: 'Search knowledge bases. kb is optional: without kb searches all.',
      inputSchema: searchArgs,
    },
    async args => handleToolCall(store, 'rag_search', args),
  )

  server.registerTool(
    'rag_add_document',
    {
      description: 'Add a text document to a knowledge base. KB folder is created if needed.',
      inputSchema: addDocArgs,
    },
    async args => handleToolCall(store, 'rag_add_document', args),
  )

  server.registerTool(
    'rag_read',
    {
      description: 'Retrieve the full extracted content of a document by KB and path.',
      inputSchema: readArgs,
    },
    async args => handleToolCall(store, 'rag_read', args),
  )

  server.registerTool(
    'rag_delete_document',
    { description: 'Delete a document from a knowledge base', inputSchema: deleteDocArgs },
    async args => handleToolCall(store, 'rag_delete_document', args),
  )

  server.registerTool(
    'rag_delete_kb',
    { description: 'Delete an entire knowledge base (folder + index)', inputSchema: kbArgs },
    async args => handleToolCall(store, 'rag_delete_kb', args),
  )

  server.registerTool(
    'rag_reindex',
    { description: 'Trigger immediate reindex of all KBs (scan for new/changed/deleted files)' },
    async () => handleToolCall(store, 'rag_reindex', {}),
  )

  server.registerTool(
    'rag_status',
    {
      description: 'Index status (KBs, documents, chunks)',
      inputSchema: kbArgs,
    },
    async args => handleToolCall(store, 'rag_status', args),
  )

  return server
}

export interface StreamableHttpTransportOptions {
  onSessionInitialized?: (sessionId: string) => void
  onSessionClosed?: (sessionId: string) => void
}

export const createStreamableHttpTransport = (options?: StreamableHttpTransportOptions) => {
  // Stateful mode: each client session gets a Mcp-Session-Id (randomUUID).
  // A dedicated transport is created per session so multiple clients can each
  // initialize without hitting "Server already initialized".
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: options?.onSessionInitialized,
    onsessionclosed: options?.onSessionClosed,
  })
}

export const handleToolCall = async (store: Store, name: string, args: Record<string, unknown>): Promise<ToolResult> => {
  switch (name) {
    case 'rag_list_kbs': {
      const kbs = await store.listKbs()
      const lines = kbs.map(k => `- **${k.name}**: ${k.docCount} documents, ${k.chunkCount} chunks, ${fmt(k.totalBytes)}`)
      return { content: [{ type: 'text', text: lines.join('\n') || 'No knowledge bases.' }] }
    }

    case 'rag_list_documents': {
      const { kb } = z.object(kbArgs).parse(args)
      const docs = await store.listFiles(kb)
      const lines = docs.map(d => `- **${d.relPath}** (${d.chunkCount} chunks, ${fmt(d.bytes)})`)
      return { content: [{ type: 'text', text: lines.join('\n') || 'No documents.' }] }
    }

    case 'rag_search': {
      const { query, kb, top_k } = z.object(searchArgs).parse(args)
      const topK = top_k ?? 10
      const results = await search(store, { query, kb: normalizeKb(kb), topK })
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No results found.' }] }
      }
      const lines = results.map(
        (r, i) =>
          `[${i + 1}] KB: **${r.kb}** — ${r.relPath}#chunk${r.chunkIndex} (score: ${r.score})
${r.content}`,
      )
      return { content: [{ type: 'text', text: lines.join('\n\n---\n\n') }] }
    }

    case 'rag_add_document': {
      const { kb, path, content } = z.object(addDocArgs).parse(args)
      await addDocument(store, kb, path, content)
      return { content: [{ type: 'text', text: `Document added: **${kb}/${path}** — indexed and searchable.` }] }
    }

    case 'rag_delete_document': {
      const { kb, path } = z.object(deleteDocArgs).parse(args)
      await deleteDocument(store, kb, path)
      return { content: [{ type: 'text', text: `Document deleted: **${kb}/${path}**` }] }
    }

    case 'rag_read': {
      const { kb, path } = z.object(readArgs).parse(args)
      const doc = await readDocument(kb, path)
      if (doc === null) {
        return { content: [{ type: 'text', text: `Document not found: **${kb}/${path}**` }], isError: true }
      }
      const text = formatDoc(doc.content, doc.frontmatter)
      return { content: [{ type: 'text', text }] }
    }

    case 'rag_delete_kb': {
      const { kb } = z.object(kbArgs).parse(args)
      await deleteKb(store, kb)
      return { content: [{ type: 'text', text: `Knowledge base deleted: **${kb}**` }] }
    }

    case 'rag_reindex': {
      const result = await scanAll(store)
      return {
        content: [
          {
            type: 'text',
            text: `Reindex complete: +${result.added} ~${result.modified} -${result.deleted} =${result.skipped} x${result.excluded}`,
          },
        ],
      }
    }

    case 'rag_status': {
      const kbs = await store.listKbs()
      const total = kbs.reduce((s, k) => s + k.chunkCount, 0)
      const totalDocs = kbs.reduce((s, k) => s + k.docCount, 0)
      const lines = [
        `**${kbs.length}** knowledge bases, **${totalDocs}** documents, **${total}** chunks`,
        '',
        ...kbs.map(k => `- **${k.name}**: ${k.docCount} docs, ${k.chunkCount} chunks, ${fmt(k.totalBytes)}`),
      ]
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  }
}

const fmt = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDoc = (content: string, frontmatter: Record<string, string> | null): string => {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return content
  const meta = Object.entries(frontmatter)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join('\n')
  return `**Frontmatter:**\n${meta}\n\n---\n\n${content}`
}
