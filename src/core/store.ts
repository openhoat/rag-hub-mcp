import Database from 'better-sqlite3'
import type { ChunkRecord, DocInfo, FileRecord, FtsRow, KbInfo, KnownFileRow, Store } from '../types.js'

const migrate = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kbs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id INTEGER NOT NULL REFERENCES kbs(id) ON DELETE CASCADE,
      rel_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      UNIQUE(kb_id, rel_path)
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      embedding BLOB,
      UNIQUE(file_id, chunk_index)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
      content, metadata UNINDEXED, tokenize='porter unicode61'
    );
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_files_kb ON files(kb_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_kbs_name ON kbs(name)')
}

class StoreImpl implements Store {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  close = async (): Promise<void> => {
    this.db.close()
  }

  listKbs = async (): Promise<KbInfo[]> => {
    const sql = `
      SELECT k.name AS name,
             COUNT(f.id) AS docCount,
             COALESCE((SELECT COUNT(*) FROM chunks c
                       JOIN files f2 ON c.file_id = f2.id
                       WHERE f2.kb_id = k.id), 0) AS chunkCount,
             COALESCE(SUM(f.bytes), 0) AS totalBytes
      FROM kbs k
      LEFT JOIN files f ON f.kb_id = k.id
      GROUP BY k.id, k.name
      ORDER BY k.name
    `
    return this.db.prepare(sql).all() as KbInfo[]
  }

  listFiles = async (kb: string): Promise<DocInfo[]> => {
    const sql = `
      SELECT f.rel_path AS relPath, f.sha256, f.mtime, f.bytes,
             COUNT(c.id) AS chunkCount
      FROM files f
      JOIN kbs k ON f.kb_id = k.id
      LEFT JOIN chunks c ON c.file_id = f.id
      WHERE k.name = ?
      GROUP BY f.id
      ORDER BY f.rel_path
    `
    return this.db.prepare(sql).all(kb) as DocInfo[]
  }

  getFile = async (kbId: number, relPath: string): Promise<FileRecord | null> => {
    const row = this.db
      .prepare('SELECT id, kb_id AS kbId, rel_path AS relPath, sha256, mtime, bytes FROM files WHERE kb_id = ? AND rel_path = ?')
      .get(kbId, relPath) as FileRecord | undefined
    return row ?? null
  }

  upsertFile = async (rec: FileRecord): Promise<number> => {
    const existing = this.db.prepare('SELECT id FROM files WHERE kb_id = ? AND rel_path = ?').get(rec.kbId, rec.relPath) as
      | { id: number }
      | undefined
    if (existing) {
      this.db.prepare('UPDATE files SET sha256 = ?, mtime = ?, bytes = ? WHERE id = ?').run(rec.sha256, rec.mtime, rec.bytes, existing.id)
      return existing.id
    }
    const r = this.db
      .prepare('INSERT INTO files (kb_id, rel_path, sha256, mtime, bytes) VALUES (?, ?, ?, ?, ?)')
      .run(rec.kbId, rec.relPath, rec.sha256, rec.mtime, rec.bytes)
    return r.lastInsertRowid as number
  }

  deleteFile = async (id: number): Promise<void> => {
    this.db.prepare('DELETE FROM files WHERE id = ?').run(id)
  }

  deleteFilesByKb = async (kbId: number): Promise<void> => {
    this.db.prepare('DELETE FROM files WHERE kb_id = ?').run(kbId)
  }

  getKbId = async (kbName: string): Promise<number> => {
    const row = this.db.prepare('SELECT id FROM kbs WHERE name = ?').get(kbName) as { id: number } | undefined
    return row?.id ?? 0
  }

  addKb = async (name: string): Promise<void> => {
    this.db.prepare('INSERT OR IGNORE INTO kbs (name) VALUES (?)').run(name)
  }

  removeKb = async (name: string): Promise<void> => {
    this.db.prepare('DELETE FROM kbs WHERE name = ?').run(name)
  }

  purgeKb = async (kbId: number): Promise<void> => {
    const chunkIds = this.db.prepare('SELECT id FROM chunks WHERE file_id IN (SELECT id FROM files WHERE kb_id = ?)').all(kbId) as {
      id: number
    }[]
    for (const row of chunkIds) {
      this.db.prepare('DELETE FROM fts_chunks WHERE rowid = ?').run(row.id)
    }
    this.db.prepare('DELETE FROM chunks WHERE file_id IN (SELECT id FROM files WHERE kb_id = ?)').run(kbId)
    this.db.prepare('DELETE FROM files WHERE kb_id = ?').run(kbId)
  }

  insertChunk = async (rec: Omit<ChunkRecord, 'id'>): Promise<number> => {
    // Idempotency: purge any pre-existing chunks for this file/chunk_index before insert
    this.db
      .prepare('DELETE FROM fts_chunks WHERE rowid IN (SELECT id FROM chunks WHERE file_id = ? AND chunk_index = ?)')
      .run(rec.fileId, rec.chunkIndex)
    this.db.prepare('DELETE FROM chunks WHERE file_id = ? AND chunk_index = ?').run(rec.fileId, rec.chunkIndex)
    const r = this.db
      .prepare('INSERT INTO chunks (file_id, chunk_index, content, metadata, embedding) VALUES (?, ?, ?, ?, ?)')
      .run(rec.fileId, rec.chunkIndex, rec.content, rec.metadata, rec.embedding ?? null)
    const chunkId = r.lastInsertRowid as number
    this.db.prepare('INSERT INTO fts_chunks (rowid, content, metadata) VALUES (?, ?, ?)').run(chunkId, rec.content, rec.metadata)
    return chunkId
  }

  deleteChunks = async (fileId: number): Promise<void> => {
    const ids = this.db.prepare('SELECT id FROM chunks WHERE file_id = ?').all(fileId) as { id: number }[]
    for (const row of ids) {
      this.db.prepare('DELETE FROM fts_chunks WHERE rowid = ?').run(row.id)
    }
    this.db.prepare('DELETE FROM chunks WHERE file_id = ?').run(fileId)
  }

  getAllChunks = async (kb?: string | string[]): Promise<ChunkRecord[]> => {
    if (!kb) return this.db.prepare('SELECT * FROM chunks').all() as ChunkRecord[]
    const names = Array.isArray(kb) ? kb : [kb]
    const kbIds: number[] = []
    for (const name of names) {
      const id = await this.getKbId(name)
      if (id !== 0) kbIds.push(id)
    }
    if (kbIds.length === 0) return []
    const placeholders = kbIds.map(() => '?').join(', ')
    return this.db
      .prepare(`
        SELECT c.* FROM chunks c
        JOIN files f ON c.file_id = f.id
        WHERE f.kb_id IN (${placeholders})
      `)
      .all(...kbIds) as ChunkRecord[]
  }

  updateFileMtime = async (id: number, mtime: number): Promise<void> => {
    this.db.prepare('UPDATE files SET mtime = ? WHERE id = ?').run(mtime, id)
  }

  listAllKbs = async (): Promise<{ id: number; name: string }[]> => {
    return this.db.prepare('SELECT id, name FROM kbs').all() as { id: number; name: string }[]
  }

  getKbName = async (kbId: number): Promise<string> => {
    const row = this.db.prepare('SELECT name FROM kbs WHERE id = ?').get(kbId) as { name: string } | undefined
    return row?.name ?? '?'
  }

  listKnownFiles = async (): Promise<KnownFileRow[]> => {
    const rows = this.db
      .prepare(`
        SELECT f.id, f.rel_path AS relPath, f.sha256, f.mtime, f.bytes, k.name AS kbName
        FROM files f JOIN kbs k ON f.kb_id = k.id
      `)
      .all() as unknown as KnownFileRow[]
    return rows
  }

  searchFts = async (matchQuery: string): Promise<FtsRow[] | null> => {
    try {
      const rows = this.db.prepare('SELECT rowid AS id, rank FROM fts_chunks WHERE fts_chunks MATCH ?').all(matchQuery) as FtsRow[]
      return rows
    } catch {
      return null
    }
  }
}

export const createStore = (dbPath: string): Store => {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return new StoreImpl(db)
}
