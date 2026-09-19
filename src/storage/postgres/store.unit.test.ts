import { afterEach, describe, expect, test, vi } from 'vitest'

// Mock config so we can drive env values (env is parsed once at module load).
// Seed with the same defaults the real zod schema would produce.
vi.mock('../../shared/config.js', () => ({
  env: {
    DATABASE_URL: undefined,
    PG_HOST: undefined,
    PG_PORT: 5432,
    PG_DATABASE: 'raghub',
    PG_USER: undefined,
    PG_PASSWORD: undefined,
    PG_SSL: false,
    EMBEDDINGS_DIMENSION: 1024,
  },
}))

import { env } from '../../shared/config.js'
import { buildPoolConfig } from './db.js'
import { migrateSql, vectorToArray, vectorToArrayFromText } from './store.js'

afterEach(() => {
  vi.resetModules()
})

// Re-import config fresh per test so the mock env can be reassembled.
const reloadConfig = (values: Record<string, unknown>): void => {
  Object.assign(env, values)
}

describe('pgStore pure helpers', () => {
  test('buildPoolConfig returns connectionString when DATABASE_URL is set', () => {
    reloadConfig({ DATABASE_URL: 'postgres://user:pass@db:5432/mydb', PG_SSL: true })
    const cfg = buildPoolConfig()
    expect(cfg.connectionString).toBe('postgres://user:pass@db:5432/mydb')
    expect(cfg.ssl).toBe(true)
    expect(cfg.connectionTimeoutMillis).toBe(3000)
  })

  test('buildPoolConfig assembles a URL from PG_* when DATABASE_URL is absent', () => {
    reloadConfig({
      DATABASE_URL: undefined,
      PG_USER: 'user',
      PG_PASSWORD: 'pwd',
      PG_HOST: 'host',
      PG_PORT: 5433,
      PG_DATABASE: 'kbdb',
    })
    const cfg = buildPoolConfig()
    expect(cfg.connectionString).toBe('postgres://user:pwd@host:5433/kbdb')
  })

  test('buildPoolConfig defaults host/port/database when PG_* are empty', () => {
    reloadConfig({
      DATABASE_URL: undefined,
      PG_USER: undefined,
      PG_PASSWORD: undefined,
      PG_HOST: undefined,
      PG_PORT: 5432,
      PG_DATABASE: 'raghub',
    })
    const cfg = buildPoolConfig()
    expect(cfg.connectionString).toContain('@localhost:5432/raghub')
  })

  test('vectorToArray renders a pgvector literal, truncating to dimension', () => {
    const vec = Float32Array.from([1, 2, 3, 4])
    expect(vectorToArray(vec, 4)).toBe('[1,2,3,4]')
    expect(vectorToArray(vec, 2)).toBe('[1,2]')
  })

  test('vectorToArrayFromText parses a pgvector literal into a Float32Array', () => {
    const result = vectorToArrayFromText('[0.5,1.5,2.5]')
    expect(result).not.toBeNull()
    expect(Array.from(result ?? [])).toEqual([0.5, 1.5, 2.5])
  })

  test('vectorToArrayFromText returns null for null input', () => {
    expect(vectorToArrayFromText(null)).toBeNull()
  })

  test('migrateSql embeds the dimension in the chunks embedding column', () => {
    const sql = migrateSql(128)
    expect(sql).toContain('embedding vector(128)')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS chunks')
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector')
  })
})
