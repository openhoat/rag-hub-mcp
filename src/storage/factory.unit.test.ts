import { beforeEach, describe, expect, test, vi } from 'vitest'

const envMock = vi.hoisted(() => ({ STORE_BACKEND: 'sqlite', DB_PATH: './rag.db' }))

vi.mock('../shared/config.js', () => ({ env: envMock }))
vi.mock('./postgres/store.js', () => ({ createPgStore: vi.fn() }))
vi.mock('./postgres/job-queue.js', () => ({ createPgJobQueue: vi.fn() }))
vi.mock('./sqlite/store.js', () => ({ createSqliteStore: vi.fn() }))
vi.mock('./sqlite/job-queue.js', () => ({ createSqliteJobQueue: vi.fn() }))

const { createStore } = await import('./factory.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('storeFactory', () => {
  test('should select sqlite by default', async () => {
    envMock.STORE_BACKEND = 'sqlite'
    await createStore()
    const sqlite = await import('./sqlite/store.js')
    expect(sqlite.createSqliteStore).toHaveBeenCalledWith('./rag.db')
    const pg = await import('./postgres/store.js')
    expect(pg.createPgStore).not.toHaveBeenCalled()
  })

  test('should select postgres when configured', async () => {
    envMock.STORE_BACKEND = 'postgres'
    const pg = await import('./postgres/store.js')
    vi.mocked(pg.createPgStore).mockResolvedValue({ name: 'pg-store' } as never)
    const store = await createStore()
    expect(pg.createPgStore).toHaveBeenCalledTimes(1)
    expect(store).toEqual({ name: 'pg-store' })
    const sqlite = await import('./sqlite/store.js')
    expect(sqlite.createSqliteStore).not.toHaveBeenCalled()
  })
})
