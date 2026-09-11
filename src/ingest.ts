import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, type Stats, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import fastGlob from 'fast-glob'
import { chunkText } from './chunk.js'
import { embedTexts } from './embed.js'
import { extractText } from './extract.js'
import { getLogger } from './log.js'
import type { IngestResult, Store } from './types.js'

const logger = getLogger('ingest')

const KB_ROOT = process.env.KB_ROOT || '/data/kbs'

interface KnownFile {
  id?: number
  mtime: number
  bytes: number
  sha256: string
}

const SCAN_IGNORE = ['.git/**', 'node_modules/**', '__pycache__/**', '.DS_Store', 'Thumbs.db', '.env', '.secrets']

export async function scanAll(store: Store, root: string = KB_ROOT): Promise<IngestResult> {
  const result: IngestResult = { added: 0, modified: 0, deleted: 0, skipped: 0 }

  if (!existsSync(root)) {
    logger.warn('KB_ROOT does not exist', root)
    return result
  }

  const kbDirs = listKbDirs(root)
  for (const name of kbDirs) {
    store.addKb(name)
  }

  const knownFiles = loadKnownFiles(store)

  for (const kbName of kbDirs) {
    const kbId = store.getKbId(kbName)
    if (kbId) await scanKb(store, kbId, kbName, root, knownFiles, result)
  }

  cleanupStale(store, kbDirs, knownFiles, result)

  logger.info(`scan: +${result.added} ~${result.modified} -${result.deleted} =${result.skipped}`)
  return result
}

function listKbDirs(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name)
}

async function scanKb(store: Store, kbId: number, kbName: string, root: string, knownFiles: Map<string, KnownFile>, result: IngestResult) {
  const kbRoot = join(root, kbName)
  const entries = await fastGlob('**/*', { cwd: kbRoot, onlyFiles: true, ignore: SCAN_IGNORE })

  for (const entry of entries) {
    const fullPath = join(kbRoot, entry)
    const st = safeStat(fullPath)
    if (!st?.isFile()) continue

    const knownKey = `${kbName}/${entry}`
    const known = knownFiles.get(knownKey)
    const knownId = known?.id

    if (isUnchanged(known, st)) {
      result.skipped++
      knownFiles.delete(knownKey)
      continue
    }

    const sha256 = hashFile(fullPath)
    if (isSameHash(known, sha256)) {
      store.db.prepare('UPDATE files SET mtime = ? WHERE id = ?').run(Math.floor(st.mtimeMs), knownId)
      knownFiles.delete(knownKey)
      result.skipped++
      continue
    }

    if (knownId) {
      store.deleteChunks(knownId)
      store.deleteFile(knownId)
      result.modified++
    } else {
      purgeStaleFile(store, kbId, entry)
      result.added++
    }

    await indexFile(store, kbId, entry, fullPath, sha256, st)
    knownFiles.delete(knownKey)
  }
}

function safeStat(fullPath: string): Stats | null {
  try {
    return statSync(fullPath)
  } catch {
    return null
  }
}

function isUnchanged(known: KnownFile | undefined, st: Stats): boolean {
  return known?.mtime === Math.floor(st.mtimeMs) && known?.bytes === st.size
}

function isSameHash(known: KnownFile | undefined, sha256: string): known is KnownFile {
  return known?.sha256 === sha256 && Boolean(known?.id)
}

function purgeStaleFile(store: Store, kbId: number, entry: string) {
  const existingId = store.getFile(kbId, entry)?.id
  if (existingId) {
    store.deleteChunks(existingId)
    store.deleteFile(existingId)
  }
}

async function cleanupStale(store: Store, kbDirs: string[], knownFiles: Map<string, KnownFile>, result: IngestResult) {
  for (const rec of knownFiles.values()) {
    if (rec.id) {
      store.deleteChunks(rec.id)
      store.deleteFile(rec.id)
      result.deleted++
    }
  }

  const staleKbs = store.db.prepare('SELECT id, name FROM kbs').all() as { id: number; name: string }[]
  for (const kb of staleKbs) {
    if (!kbDirs.includes(kb.name)) {
      store.deleteFilesByKb(kb.id)
      store.removeKb(kb.name)
    }
  }
}

export async function indexFile(
  store: Store,
  kbId: number,
  relPath: string,
  fullPath: string,
  sha256: string,
  st: { mtimeMs: number; size: number },
) {
  const text = await extractText(fullPath)
  if (!text) return

  const fileId = store.upsertFile({
    kbId,
    relPath,
    sha256,
    mtime: Math.floor(st.mtimeMs),
    bytes: st.size,
  })

  const kbName = (store.db.prepare('SELECT name FROM kbs WHERE id = ?').get(kbId) as { name: string } | undefined)?.name || '?'
  const chunks = chunkText(text, relPath, kbName)
  if (chunks.length === 0) return

  const texts = chunks.map(c => c.content)
  let embeddings: Float32Array[] = []
  try {
    embeddings = await embedTexts(texts)
  } catch (err) {
    logger.error('embed failed, storing without vectors', err)
  }

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    const emb = embeddings[i]
    const embBuf = emb ? Buffer.from(emb.buffer) : null
    store.insertChunk({ fileId, chunkIndex: i, content: c.content, metadata: c.metadata, embedding: embBuf })
  }
}

export async function addDocument(store: Store, kb: string, relPath: string, content: string, root: string = KB_ROOT) {
  const kbDir = join(root, kb)
  mkdirSync(kbDir, { recursive: true })
  const fullPath = join(kbDir, relPath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  await scanAll(store, root)
}

export async function deleteDocument(store: Store, kb: string, relPath: string, root: string = KB_ROOT) {
  const fullPath = join(root, kb, relPath)
  const normalized = relative(root, fullPath)
  if (normalized.startsWith('..')) throw new Error('invalid path')
  if (existsSync(fullPath)) unlinkSync(fullPath)

  const kbId = store.getKbId(kb)
  if (!kbId) return
  const file = store.getFile(kbId, relPath)
  if (file?.id) {
    store.deleteChunks(file.id)
    store.deleteFile(file.id)
  }
}

export async function deleteKb(store: Store, kb: string, root: string = KB_ROOT) {
  const kbDir = join(root, kb)
  if (existsSync(kbDir)) rmSync(kbDir, { recursive: true, force: true })
  const kbId = store.getKbId(kb)
  if (kbId) {
    store.deleteFilesByKb(kbId)
    store.removeKb(kb)
  }
}

function loadKnownFiles(store: Store): Map<string, KnownFile> {
  const map = new Map<string, KnownFile>()
  const rows = store.db
    .prepare(`
    SELECT f.id, f.rel_path, f.sha256, f.mtime, f.bytes, k.name AS kb_name
    FROM files f JOIN kbs k ON f.kb_id = k.id
  `)
    .all() as unknown as { id: number; rel_path: string; sha256: string; mtime: number; bytes: number; kb_name: string }[]
  for (const r of rows) {
    map.set(`${r.kb_name}/${r.rel_path}`, { id: r.id, mtime: r.mtime, bytes: r.bytes, sha256: r.sha256 })
  }
  return map
}

function hashFile(filePath: string): string {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}
