import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { addDocument, deleteDocument, deleteKb, scanAll } from './ingest.js'
import { search } from './search.js'
import type { Store } from './types.js'

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const RAG_VERSION = process.env.RAG_VERSION || '0.0.1'

const kbArgs = { kb: z.string().describe('Knowledge base name') }
const searchArgs = {
  query: z.string().describe('Natural language query'),
  kb: z.string().optional().describe('Knowledge base name (optional, all if omitted)'),
  top_k: z.number().optional().describe('Number of results (default 10)'),
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

export function createMcpServer(store: Store): McpServer {
  const server = new McpServer({ name: 'rag-hub-mcp', version: RAG_VERSION }, { capabilities: { tools: {} } })

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

export function createStreamableHttpTransport(options?: StreamableHttpTransportOptions) {
  // Stateful mode: each client session gets a Mcp-Session-Id (randomUUID).
  // A dedicated transport is created per session so multiple clients can each
  // initialize without hitting "Server already initialized".
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: options?.onSessionInitialized,
    onsessionclosed: options?.onSessionClosed,
  })
}

export async function handleToolCall(store: Store, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case 'rag_list_kbs': {
      const kbs = store.listKbs()
      const lines = kbs.map(k => `- **${k.name}**: ${k.docCount} documents, ${k.chunkCount} chunks, ${fmt(k.totalBytes)}`)
      return { content: [{ type: 'text', text: lines.join('\n') || 'No knowledge bases.' }] }
    }

    case 'rag_list_documents': {
      const docs = store.listFiles(args.kb as string)
      const lines = docs.map(d => `- **${d.relPath}** (${d.chunkCount} chunks, ${fmt(d.bytes)})`)
      return { content: [{ type: 'text', text: lines.join('\n') || 'No documents.' }] }
    }

    case 'rag_search': {
      const query = args.query as string
      const kb = args.kb as string | undefined
      const topK = (args.top_k as number) || 10
      const results = await search(store, { query, kb, topK })
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
      const kb = args.kb as string
      const path = args.path as string
      const content = args.content as string
      const safePath = path.replaceAll('../', '').replace(/^\/+/, '')
      await addDocument(store, kb, safePath, content)
      return { content: [{ type: 'text', text: `Document added: **${kb}/${safePath}** — indexed and searchable.` }] }
    }

    case 'rag_delete_document': {
      const kb = args.kb as string
      const path = args.path as string
      await deleteDocument(store, kb, path)
      return { content: [{ type: 'text', text: `Document deleted: **${kb}/${path}**` }] }
    }

    case 'rag_delete_kb': {
      const kb = args.kb as string
      await deleteKb(store, kb)
      return { content: [{ type: 'text', text: `Knowledge base deleted: **${kb}**` }] }
    }

    case 'rag_reindex': {
      const result = await scanAll(store)
      return {
        content: [{ type: 'text', text: `Reindex complete: +${result.added} ~${result.modified} -${result.deleted} =${result.skipped}` }],
      }
    }

    case 'rag_status': {
      const kbs = store.listKbs()
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

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
