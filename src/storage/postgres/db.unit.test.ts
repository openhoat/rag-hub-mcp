import type { Pool } from 'pg'
import { describe, expect, test, vi } from 'vitest'
import { poolToDb } from './db.js'

// The `pg` Pool is faked so the adapter (query/exec/transaction/close) is
// exercised without a running Postgres. Real store tests use PGlite instead.

interface FakeClient {
  query: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
}

const makePool = () => {
  const client: FakeClient = {
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  }
  const pool = {
    query: vi.fn(async () => ({ rows: [{ n: 1 }] })),
    connect: vi.fn(async () => client),
    end: vi.fn(async () => {}),
  }
  return { pool, client }
}

const asPool = (pool: ReturnType<typeof makePool>['pool']): Pool => pool as unknown as Pool

describe('poolToDb', () => {
  test('query delegates to the pool and defaults params', async () => {
    const { pool } = makePool()
    const db = poolToDb(asPool(pool))
    const res = await db.query('SELECT 1')
    expect(pool.query).toHaveBeenCalledWith('SELECT 1', [])
    expect(res.rows).toEqual([{ n: 1 }])
  })

  test('exec splits on semicolons and skips blank statements', async () => {
    const { pool } = makePool()
    const db = poolToDb(asPool(pool))
    await db.exec("CREATE TABLE t (x text); INSERT INTO t VALUES ('a;b');  ")
    expect(pool.query).toHaveBeenCalledTimes(2)
    expect(pool.query).toHaveBeenNthCalledWith(1, 'CREATE TABLE t (x text)')
    expect(pool.query).toHaveBeenNthCalledWith(2, "INSERT INTO t VALUES ('a;b')")
  })

  test('transaction commits and releases on success', async () => {
    const { pool, client } = makePool()
    const db = poolToDb(asPool(pool))
    const result = await db.transaction(async tx => {
      await tx.query('SELECT 1')
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN')
    expect(client.query).toHaveBeenNthCalledWith(2, 'SELECT 1', [])
    expect(client.query).toHaveBeenNthCalledWith(3, 'COMMIT')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  test('transaction rolls back, rethrows and releases on failure', async () => {
    const { pool, client } = makePool()
    const db = poolToDb(asPool(pool))
    await expect(
      db.transaction(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  test('transaction forwards client queries through the DbQuery wrapper', async () => {
    const { pool, client } = makePool()
    const db = poolToDb(asPool(pool))
    await db.transaction(async tx => tx.query('SELECT $1', [42]))
    expect(client.query).toHaveBeenCalledWith('SELECT $1', [42])
  })

  test('close ends the pool', async () => {
    const { pool } = makePool()
    const db = poolToDb(asPool(pool))
    await db.close()
    expect(pool.end).toHaveBeenCalledTimes(1)
  })
})
