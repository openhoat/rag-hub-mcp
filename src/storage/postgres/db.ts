import type { Pool, PoolClient, QueryResultRow } from 'pg'
import { env } from '../../shared/config.js'

interface PgRow {
  [key: string]: unknown
}

export interface DbQuery {
  query<TResult extends Record<string, unknown> = PgRow>(sql: string, params?: unknown[]): Promise<{ rows: TResult[] }>
}

export interface Db extends DbQuery {
  exec(sql: string): Promise<void>
  transaction<T>(fn: (client: DbQuery) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export const buildPoolConfig = (): { connectionString: string; ssl?: boolean; connectionTimeoutMillis?: number } => {
  if (env.DATABASE_URL) {
    return { connectionString: env.DATABASE_URL, ssl: env.PG_SSL || undefined, connectionTimeoutMillis: 3000 }
  }
  return {
    connectionString: `postgres://${env.PG_USER ?? ''}:${env.PG_PASSWORD ?? ''}@${env.PG_HOST ?? 'localhost'}:${env.PG_PORT}/${env.PG_DATABASE ?? 'raghub'}`,
    ssl: env.PG_SSL || undefined,
    connectionTimeoutMillis: 3000,
  }
}

export const poolToDb = (pool: Pool): Db => ({
  query: async <TResult extends QueryResultRow = PgRow>(sql: string, params: unknown[] = []): Promise<{ rows: TResult[] }> => {
    return pool.query<TResult>(sql, params)
  },
  exec: async (sql: string): Promise<void> => {
    for (const stmt of splitStatements(sql)) {
      await pool.query(stmt)
    }
  },
  transaction: async <T>(fn: (client: DbQuery) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(toDbQuery(client))
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },
  close: async (): Promise<void> => {
    await pool.end()
  },
})

const toDbQuery = (client: PoolClient): DbQuery => ({
  query: async <TResult extends QueryResultRow = PgRow>(sql: string, params: unknown[] = []): Promise<{ rows: TResult[] }> => {
    return client.query<TResult>(sql, params)
  },
})

const pushStatement = (statements: string[], current: string): void => {
  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)
}

const splitStatements = (sql: string): string[] => {
  const statements: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === "'" && sql[i - 1] !== '\\') inQuote = !inQuote
    if (ch === ';' && !inQuote) {
      pushStatement(statements, current)
      current = ''
    } else {
      current += ch
    }
  }
  pushStatement(statements, current)
  return statements
}
