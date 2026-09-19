import { Pool } from 'pg'
import { env } from '../../shared/config.js'
import type { ChunkRecord, DocInfo, FileRecord, FtsRow, KbInfo, KnownFileRow, Store } from '../../shared/types.js'
import type { Db } from './db.js'
import { buildPoolConfig, poolToDb } from './db.js'

/**
 * PostgreSQL + pgvector implementation of the Store interface.
 *
 * The schema mirrors the SQLite store (kbs/files/chunks) with two differences:
 *  - `embedding` is a pgvector `vector(N)` column instead of a raw BLOB. It is
 *    converted to/from a Float32 Buffer at the store boundary so the rest of the
 *    code base never sees the backend's text encoding.
 *  - Full-text search uses a generated `tsv` tsvector column + GIN index, ranked
 *    with `ts_rank()`/`to_tsquery()` instead of SQLite FTS5.
 *
 * Migration is idempotent and runs on first connect.
 */
export const migrateSql = (dimension: number): string => `
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS kbs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    kb_id INTEGER NOT NULL REFERENCES kbs(id) ON DELETE CASCADE,
    rel_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    mtime BIGINT NOT NULL,
    bytes BIGINT NOT NULL,
    UNIQUE(kb_id, rel_path)
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding vector(${dimension}),
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    UNIQUE(file_id, chunk_index)
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
  CREATE INDEX IF NOT EXISTS idx_files_kb ON files(kb_id);
  CREATE INDEX IF NOT EXISTS idx_kbs_name ON kbs(name);
  CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING GIN(tsv);
`

/** Convert a Float32Array to a pgvector literal `[a,b,c]`. */
export const vectorToArray = (vec: Float32Array, dimension: number): string => {
  const floats = vec.length > dimension ? vec.slice(0, dimension) : vec
  return `[${Array.from(floats).join(',')}]`
}

/** Convert a pgvector literal `[a,b,c]` back to a Float32Array. */
export const vectorToArrayFromText = (value: string | null): Float32Array | null => {
  if (value === null) return null
  return Float32Array.from(value.slice(1, -1).split(',').map(Number))
}

/** Map a pg `ts_rank` (higher = better) to a positive [0,1] relevance. */
export const normalizeTsRank = (rank: number): number => {
  return Math.min(1, Math.max(0, rank / (1 + rank)))
}

type PgNumeric = number | string | null

type PgMetadata = string | Record<string, unknown> | null

type PgEmbedding = string | Buffer | null

interface PgRow {
  id: PgNumeric
  kbId?: PgNumeric
  relPath?: string
  sha256?: string
  mtime?: PgNumeric
  bytes?: PgNumeric
  chunkIndex?: PgNumeric
  content?: string
  metadata?: PgMetadata
  embedding?: PgEmbedding
  fileId?: PgNumeric
  kbName?: string
  name?: string
  docCount?: PgNumeric
  chunkCount?: PgNumeric
  totalBytes?: PgNumeric
  rank?: PgNumeric
  [key: string]: unknown
}

/** Coerce a pg numeric value (string | number) into a JS number. */
const toNum = (v: unknown): number => (v === undefined || v === null ? 0 : Number(v))

export class PgStore implements Store {
  constructor(
    private readonly db: Db,
    private readonly dimension: number = env.EMBEDDINGS_DIMENSION,
  ) {}

  private readonly query = async <TResult extends Record<string, unknown> = PgRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: TResult[] }> => {
    return this.db.query<TResult>(sql, params)
  }

  close = async (): Promise<void> => {
    await this.db.close()
  }

  listKbs = async (): Promise<KbInfo[]> => {
    const { rows } = await this.query(`
      SELECT k.name,
             COUNT(f.id)::int AS "docCount",
             COALESCE((SELECT COUNT(*) FROM chunks c JOIN files f2 ON c.file_id = f2.id WHERE f2.kb_id = k.id), 0)::int AS "chunkCount",
             COALESCE(SUM(f.bytes), 0)::bigint AS "totalBytes"
      FROM kbs k
      LEFT JOIN files f ON f.kb_id = k.id
      GROUP BY k.id, k.name
      ORDER BY k.name
    `)
    return rows.map(r => ({
      name: r.name ?? '',
      docCount: toNum(r.docCount),
      chunkCount: toNum(r.chunkCount),
      totalBytes: toNum(r.totalBytes),
    }))
  }

  listFiles = async (kb: string): Promise<DocInfo[]> => {
    const { rows } = await this.query(
      `
      SELECT f.rel_path AS "relPath", f.sha256, f.mtime, f.bytes,
             COUNT(c.id)::int AS "chunkCount"
      FROM files f
      JOIN kbs k ON f.kb_id = k.id
      LEFT JOIN chunks c ON c.file_id = f.id
      WHERE k.name = $1
      GROUP BY f.id
      ORDER BY f.rel_path
      `,
      [kb],
    )
    return rows.map(r => ({
      relPath: r.relPath ?? '',
      sha256: r.sha256 ?? '',
      mtime: toNum(r.mtime),
      bytes: toNum(r.bytes),
      chunkCount: toNum(r.chunkCount),
    }))
  }

  getFile = async (kbId: number, relPath: string): Promise<FileRecord | null> => {
    const { rows } = await this.query(
      'SELECT id, kb_id AS "kbId", rel_path AS "relPath", sha256, mtime, bytes FROM files WHERE kb_id = $1 AND rel_path = $2',
      [kbId, relPath],
    )
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      id: toNum(r.id),
      kbId: toNum(r.kbId),
      relPath: r.relPath ?? '',
      sha256: r.sha256 ?? '',
      mtime: toNum(r.mtime),
      bytes: toNum(r.bytes),
    }
  }

  upsertFile = async (rec: FileRecord): Promise<number> => {
    return this.db.transaction(async client => {
      const existing = await client.query<PgRow>('SELECT id FROM files WHERE kb_id = $1 AND rel_path = $2', [rec.kbId, rec.relPath])
      if (existing.rows.length > 0) {
        const id = toNum(existing.rows[0].id)
        await client.query('UPDATE files SET sha256 = $1, mtime = $2, bytes = $3 WHERE id = $4', [rec.sha256, rec.mtime, rec.bytes, id])
        return id
      }
      const r = await client.query<PgRow>(
        'INSERT INTO files (kb_id, rel_path, sha256, mtime, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [rec.kbId, rec.relPath, rec.sha256, rec.mtime, rec.bytes],
      )
      return toNum(r.rows[0].id)
    })
  }

  deleteFile = async (id: number): Promise<void> => {
    await this.query('DELETE FROM files WHERE id = $1', [id])
  }

  deleteFilesByKb = async (kbId: number): Promise<void> => {
    await this.query('DELETE FROM files WHERE kb_id = $1', [kbId])
  }

  getKbId = async (kbName: string): Promise<number> => {
    const { rows } = await this.query('SELECT id FROM kbs WHERE name = $1', [kbName])
    return rows.length > 0 ? toNum(rows[0].id) : 0
  }

  addKb = async (name: string): Promise<void> => {
    await this.query('INSERT INTO kbs (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name])
  }

  removeKb = async (name: string): Promise<void> => {
    await this.query('DELETE FROM kbs WHERE name = $1', [name])
  }

  purgeKb = async (kbId: number): Promise<void> => {
    await this.query('DELETE FROM files WHERE kb_id = $1', [kbId])
  }

  insertChunk = async (rec: Omit<ChunkRecord, 'id'>): Promise<number> => {
    return this.db.transaction(async client => {
      // Idempotency: purge any pre-existing chunk for this file/chunk_index before insert.
      await client.query('DELETE FROM chunks WHERE file_id = $1 AND chunk_index = $2', [rec.fileId, rec.chunkIndex])
      const embedding = rec.embedding ? vectorToArray(rec.embedding, this.dimension) : null
      const r = await client.query<PgRow>(
        'INSERT INTO chunks (file_id, chunk_index, content, metadata, embedding) VALUES ($1, $2, $3, $4::jsonb, $5::vector) RETURNING id',
        [rec.fileId, rec.chunkIndex, rec.content, rec.metadata, embedding],
      )
      return toNum(r.rows[0].id)
    })
  }

  deleteChunks = async (fileId: number): Promise<void> => {
    await this.query('DELETE FROM chunks WHERE file_id = $1', [fileId])
  }

  getAllChunks = async (kb?: string | string[]): Promise<ChunkRecord[]> => {
    if (!kb) {
      const { rows } = await this.query(
        'SELECT id, file_id AS "fileId", chunk_index AS "chunkIndex", content, metadata::text, embedding::text AS embedding FROM chunks',
      )
      return rows.map(r => this.toChunk(r))
    }
    const names = Array.isArray(kb) ? kb : [kb]
    const { rows } = await this.query(
      `
      SELECT c.id, c.file_id AS "fileId", c.chunk_index AS "chunkIndex", c.content, c.metadata::text, c.embedding::text AS embedding
      FROM chunks c
      JOIN files f ON c.file_id = f.id
      JOIN kbs k ON f.kb_id = k.id
      WHERE k.name = ANY($1)
      `,
      [names],
    )
    return rows.map(r => this.toChunk(r))
  }

  updateFileMtime = async (id: number, mtime: number): Promise<void> => {
    await this.query('UPDATE files SET mtime = $1 WHERE id = $2', [mtime, id])
  }

  listAllKbs = async (): Promise<{ id: number; name: string }[]> => {
    const { rows } = await this.query('SELECT id, name FROM kbs ORDER BY name')
    return rows.map(r => ({ id: toNum(r.id), name: r.name ?? '' }))
  }

  getKbName = async (kbId: number): Promise<string> => {
    const { rows } = await this.query('SELECT name FROM kbs WHERE id = $1', [kbId])
    return rows.length > 0 && rows[0].name ? rows[0].name : '?'
  }

  listKnownFiles = async (): Promise<KnownFileRow[]> => {
    const { rows } = await this.query(
      `
      SELECT f.id, f.rel_path AS "relPath", f.sha256, f.mtime, f.bytes, k.name AS "kbName"
      FROM files f JOIN kbs k ON f.kb_id = k.id
      `,
    )
    return rows.map(r => ({
      id: toNum(r.id),
      relPath: r.relPath ?? '',
      sha256: r.sha256 ?? '',
      mtime: toNum(r.mtime),
      bytes: toNum(r.bytes),
      kbName: r.kbName ?? '',
    }))
  }

  searchFts = async (words: string[]): Promise<FtsRow[] | null> => {
    if (words.length === 0) return null
    const tsQuery = words.map(w => w.replaceAll("'", "''")).join(' & ')
    try {
      const { rows } = await this.query(
        `
        SELECT id, ts_rank(tsv, to_tsquery('english', $1)) AS rank
        FROM chunks
        WHERE tsv @@ to_tsquery('english', $1)
        ORDER BY rank DESC
        `,
        [tsQuery],
      )
      // pg ts_rank is positive with higher = better. Normalize to a unified
      // [0,1] relevance so the Store contract is backend-neutral.
      return rows.map(r => ({ id: toNum(r.id), score: normalizeTsRank(toNum(r.rank)) }))
    } catch {
      return null
    }
  }

  hasNullEmbeddings = async (fileId: number): Promise<boolean> => {
    const { rows } = await this.query('SELECT 1 FROM chunks WHERE file_id = $1 AND embedding IS NULL LIMIT 1', [fileId])
    return rows.length > 0
  }

  private readonly toChunk = (r: PgRow): ChunkRecord => {
    return {
      id: toNum(r.id),
      fileId: toNum(r.fileId),
      chunkIndex: toNum(r.chunkIndex),
      content: r.content ?? '',
      metadata: typeof r.metadata === 'object' ? JSON.stringify(r.metadata) : (r.metadata ?? '{}'),
      embedding: vectorToArrayFromText((r.embedding as string | null) ?? null),
    }
  }
}

/** Create a PostgreSQL-backed Store over an injected Db (prod: pg.Pool via
 * `poolToDb`; tests: in-memory PGlite). Migration runs before returning. */
export const createPgStoreFromDb = async (db: Db, dimension: number = env.EMBEDDINGS_DIMENSION): Promise<Store> => {
  await db.exec(migrateSql(dimension))
  return new PgStore(db, dimension)
}

/** Create a PostgreSQL-backed Store from the configured env connection. */
export const createPgStore = async (): Promise<Store> => {
  const pool = new Pool(buildPoolConfig())
  try {
    return await createPgStoreFromDb(poolToDb(pool))
  } catch (err) {
    await pool.end()
    throw err
  }
}
