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
  embedding: Float32Array | null
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

export interface KnownFileRow {
  id: number
  relPath: string
  sha256: string
  mtime: number
  bytes: number
  kbName: string
}

export interface FtsRow {
  id: number
  /** Positive keyword relevance in [0, 1]. Backend-neutral — no raw rank, no sign convention. */
  score: number
}

export interface Store {
  close(): Promise<void>
  listKbs(): Promise<KbInfo[]>
  listFiles(kb: string): Promise<DocInfo[]>
  getFile(kbId: number, relPath: string): Promise<FileRecord | null>
  upsertFile(rec: FileRecord): Promise<number>
  deleteFile(id: number): Promise<void>
  deleteFilesByKb(kbId: number): Promise<void>
  getKbId(kbName: string): Promise<number>
  addKb(name: string): Promise<void>
  removeKb(name: string): Promise<void>
  insertChunk(rec: Omit<ChunkRecord, 'id'>): Promise<number>
  deleteChunks(fileId: number): Promise<void>
  getAllChunks(kb?: string | string[]): Promise<ChunkRecord[]>
  purgeKb(kbId: number): Promise<void>
  updateFileMtime(id: number, mtime: number): Promise<void>
  listAllKbs(): Promise<{ id: number; name: string }[]>
  getKbName(kbId: number): Promise<string>
  listKnownFiles(): Promise<KnownFileRow[]>
  searchFts(words: string[]): Promise<FtsRow[] | null>
  /** True when the file has at least one chunk stored without an embedding. */
  hasNullEmbeddings(fileId: number): Promise<boolean>
}

export interface IngestResult {
  added: number
  modified: number
  deleted: number
  skipped: number
  /** Files scanned but not indexed (no extractable text — binary/empty). */
  excluded: number
}

export interface ExtractResult {
  text: string
  frontmatter: Record<string, string> | null
}
