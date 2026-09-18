import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, type Stats, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import fastGlob from 'fast-glob'
import { env } from '../config.js'
import { getLogger } from '../log.js'
import { chunkText } from '../pipeline/chunk.js'
import { enrichChunkContent } from '../pipeline/contextual-chunking.js'
import { embedTexts } from '../pipeline/embed.js'
import { extractText, isBinaryContent, isTextFile } from '../pipeline/extract.js'
import type { IngestResult, JobQueue, Store } from '../types.js'
import { sanitizeRelativePath } from './path.js'

const logger = getLogger('ingest')

const KB_ROOT = env.KB_ROOT

interface KnownFile {
  id?: number
  mtime: number
  bytes: number
  sha256: string
}

const SCAN_IGNORE = ['.git/**', 'node_modules/**', '__pycache__/**', '.DS_Store', 'Thumbs.db', '.env', '.secrets']

/** Peek at the head of a file to detect binary content — cheap, no full extract. */
const canIndexFile = (fullPath: string): boolean => {
  if (isTextFile(fullPath)) return true
  // Unknown extension: sniff the head
  try {
    const buf = readFileSync(fullPath)
    return !isBinaryContent(buf)
  } catch {
    return false
  }
}

export const forceReindex = async (store: Store, queue: JobQueue, root: string = KB_ROOT): Promise<IngestResult> => {
  const kbs = await store.listAllKbs()
  for (const kb of kbs) {
    await store.purgeKb(kb.id)
  }
  await queue.clear()
  return scanAll(store, queue, root)
}

export const scanAll = async (store: Store, queue: JobQueue, root: string = KB_ROOT): Promise<IngestResult> => {
  const result: IngestResult = {
    added: 0,
    modified: 0,
    deleted: 0,
    skipped: 0,
    excluded: 0,
    enqueued: 0,
  }

  if (!existsSync(root)) {
    logger.warn('KB_ROOT does not exist', root)
    return result
  }

  const kbDirs = listKbDirs(root)
  for (const name of kbDirs) {
    await store.addKb(name)
  }

  const knownFiles = await loadKnownFiles(store)

  for (const kbName of kbDirs) {
    const kbId = await store.getKbId(kbName)
    if (kbId) await scanKb(store, queue, kbId, kbName, root, knownFiles, result)
  }

  await cleanupStale(store, queue, kbDirs, knownFiles, result)

  logger.info(
    'scan: +%d ~%d -%d =%d x%d ->%d',
    result.added,
    result.modified,
    result.deleted,
    result.skipped,
    result.excluded,
    result.enqueued,
  )
  return result
}

const listKbDirs = (root: string): string[] => {
  return readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name)
}

const scanKb = async (
  store: Store,
  queue: JobQueue,
  _kbId: number,
  kbName: string,
  root: string,
  knownFiles: Map<string, KnownFile>,
  result: IngestResult,
) => {
  const kbRoot = join(root, kbName)
  const entries = await fastGlob('**/*', {
    cwd: kbRoot,
    onlyFiles: true,
    ignore: SCAN_IGNORE,
  })

  for (const entry of entries) {
    const fullPath = join(kbRoot, entry)
    const st = safeStat(fullPath)
    if (!st?.isFile()) continue

    const knownKey = `${kbName}/${entry}`
    const known = knownFiles.get(knownKey)
    const knownId = known?.id

    const needsReembed = knownId ? await store.hasNullEmbeddings(knownId) : false

    if (isUnchanged(known, st) && !needsReembed) {
      result.skipped++
      knownFiles.delete(knownKey)
      continue
    }

    const sha256 = hashFile(fullPath)

    if (isSameHash(known, sha256) && !needsReembed) {
      await store.updateFileMtime(knownId as number, Math.floor(st.mtimeMs))
      knownFiles.delete(knownKey)
      result.skipped++
      continue
    }

    // Pre-check: skip binary files
    if (!canIndexFile(fullPath)) {
      result.excluded++
      logger.warn('skipped (no extractable text): %s', entry)
      // Delete old data if any (stale file or needsReembed)
      if (knownId) {
        await store.deleteChunks(knownId)
        await store.deleteFile(knownId)
      }
      knownFiles.delete(knownKey)
      continue
    }

    if (needsReembed) {
      logger.info('re-indexing (null embeddings): %s', entry)
      await store.deleteChunks(knownId as number)
    } else if (knownId) {
      await store.deleteChunks(knownId)
      await store.deleteFile(knownId)
    }

    // Enqueue the index job (the producer side is done — worker will extract/chunk/embed/insert)
    await queue.enqueue([
      {
        kb: kbName,
        relPath: entry,
        op: 'index',
        sha256,
        mtime: Math.floor(st.mtimeMs),
        bytes: st.size,
      },
    ])

    if (knownId || needsReembed) {
      result.modified++
    } else {
      result.added++
    }
    result.enqueued++

    knownFiles.delete(knownKey)
  }
}

const safeStat = (fullPath: string): Stats | null => {
  try {
    return statSync(fullPath)
  } catch {
    return null
  }
}

const isUnchanged = (known: KnownFile | undefined, st: Stats): boolean => {
  return known?.mtime === Math.floor(st.mtimeMs) && known?.bytes === st.size
}

const isSameHash = (known: KnownFile | undefined, sha256: string): known is KnownFile => {
  return known?.sha256 === sha256 && Boolean(known?.id)
}

const cleanupStale = async (store: Store, queue: JobQueue, kbDirs: string[], knownFiles: Map<string, KnownFile>, result: IngestResult) => {
  for (const rec of knownFiles.values()) {
    if (rec.id) {
      await store.deleteChunks(rec.id)
      await store.deleteFile(rec.id)
    }
    result.deleted++
  }

  const staleKbs = await store.listAllKbs()
  for (const kb of staleKbs) {
    if (!kbDirs.includes(kb.name)) {
      await queue.clearForKb(kb.name)
      await store.deleteFilesByKb(kb.id)
      await store.removeKb(kb.name)
    }
  }
}

export const indexFile = async (
  store: Store,
  kbId: number,
  relPath: string,
  fullPath: string,
  sha256: string,
  st: { mtimeMs: number; size: number },
): Promise<boolean> => {
  const { text, frontmatter } = await extractText(fullPath)
  if (!text) return false

  const fileId = await store.upsertFile({
    kbId,
    relPath,
    sha256,
    mtime: Math.floor(st.mtimeMs),
    bytes: st.size,
  })

  const kbName = await store.getKbName(kbId)
  const chunks = chunkText(text, relPath, kbName, frontmatter)
  if (chunks.length === 0) return false

  const texts = await Promise.all(
    chunks.map(c => {
      const meta = JSON.parse(c.metadata) as {
        path?: string
        headings?: string
      }
      return enrichChunkContent(c.content, {
        path: meta.path ?? relPath,
        headings: meta.headings ?? '',
      })
    }),
  )
  let embeddings: Float32Array[] = []
  try {
    embeddings = await embedTexts(texts)
  } catch (err) {
    logger.warn('embed batch failed, retrying per-chunk', err)
    for (let i = 0; i < texts.length; i++) {
      try {
        const [emb] = await embedTexts([texts[i]])
        embeddings[i] = emb
      } catch (perChunkErr) {
        logger.warn('embed failed for chunk %d, storing without vector', i, perChunkErr)
      }
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    const emb = embeddings[i]
    await store.insertChunk({
      fileId,
      chunkIndex: i,
      content: c.content,
      metadata: c.metadata,
      embedding: emb,
    })
  }
  return true
}

export const addDocument = async (store: Store, queue: JobQueue, kb: string, relPath: string, content: string, root: string = KB_ROOT) => {
  const kbDir = join(root, kb)
  mkdirSync(kbDir, { recursive: true })
  const fullPath = sanitizeRelativePath(root, kb, relPath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')

  const st = statSync(fullPath)
  const sha256 = hashFile(fullPath)
  await store.addKb(kb)
  await queue.enqueue([
    {
      kb,
      relPath,
      op: 'index',
      sha256,
      mtime: Math.floor(st.mtimeMs),
      bytes: st.size,
    },
  ])
}

export const deleteDocument = async (store: Store, queue: JobQueue, kb: string, relPath: string, root: string = KB_ROOT) => {
  const fullPath = sanitizeRelativePath(root, kb, relPath)
  if (existsSync(fullPath)) unlinkSync(fullPath)

  await queue.clearForFile(kb, relPath)

  const kbId = await store.getKbId(kb)
  if (!kbId) return
  const file = await store.getFile(kbId, relPath)
  if (file?.id) {
    await store.deleteChunks(file.id)
    await store.deleteFile(file.id)
  }
}

export const deleteKb = async (store: Store, queue: JobQueue, kb: string, root: string = KB_ROOT) => {
  const kbDir = join(root, kb)
  const normalized = relative(root, kbDir)
  if (normalized === '' || normalized.startsWith('..')) throw new Error('invalid path')
  if (existsSync(kbDir)) rmSync(kbDir, { recursive: true, force: true })

  await queue.clearForKb(kb)

  const kbId = await store.getKbId(kb)
  if (kbId) {
    await store.removeKb(kb)
  }
}

export const readDocument = async (
  kb: string,
  relPath: string,
  root: string = KB_ROOT,
): Promise<{
  content: string
  frontmatter: Record<string, string> | null
} | null> => {
  const fullPath = sanitizeRelativePath(root, kb, relPath)
  if (!existsSync(fullPath)) return null
  const { text, frontmatter } = await extractText(fullPath)
  if (!text) return null
  return { content: text, frontmatter }
}

const loadKnownFiles = async (store: Store): Promise<Map<string, KnownFile>> => {
  const map = new Map<string, KnownFile>()
  const rows = await store.listKnownFiles()
  for (const r of rows) {
    map.set(`${r.kbName}/${r.relPath}`, {
      id: r.id,
      mtime: r.mtime,
      bytes: r.bytes,
      sha256: r.sha256,
    })
  }
  return map
}

const hashFile = (filePath: string): string => {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}
