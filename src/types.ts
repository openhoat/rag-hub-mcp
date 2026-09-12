import type Database from 'better-sqlite3'

export interface FileRecord {
  id?: number
  kbId: number
  relPath: string
  sha256: string
  mtime: number
  bytes: number
}

export interface ChunkRecord {
  id?: number
  fileId: number
  chunkIndex: number
  content: string
  metadata: string
  embedding: Buffer | null
}

export interface KbInfo {
  name: string
  docCount: number
  chunkCount: number
  totalBytes: number
}

export interface DocInfo {
  relPath: string
  sha256: string
  mtime: number
  bytes: number
  chunkCount: number
}

export interface SearchResult {
  kb: string
  relPath: string
  chunkIndex: number
  content: string
  score: number
}

export interface Store {
  db: Database.Database
  close(): void
  listKbs(): KbInfo[]
  listFiles(kb: string): DocInfo[]
  getFile(kbId: number, relPath: string): FileRecord | null
  upsertFile(rec: FileRecord): number
  deleteFile(id: number): void
  deleteFilesByKb(kbId: number): void
  getKbId(kbName: string): number
  addKb(name: string): void
  removeKb(name: string): void
  insertChunk(rec: Omit<ChunkRecord, 'id'>): number
  deleteChunks(fileId: number): void
  getAllChunks(kb?: string | string[]): ChunkRecord[]
  purgeKb(kbId: number): void
}

export interface IngestResult {
  added: number
  modified: number
  deleted: number
  skipped: number
}
