import { beforeEach, describe, expect, test, vi } from 'vitest'

// The factory picks the backend from `env.STORE_BACKEND`. Module mocks let us
// observe both branches without touching a real database.

const envMock = vi.hoisted(() => ({ STORE_BACKEND: 'sqlite', DB_PATH: './rag.db' }))
const pgMock = vi.hoisted(() => ({ createPgStore: vi.fn() }))
const sqliteMock = vi.hoisted(() => ({ createSqliteStore: vi.fn() }))

vi.mock('../config.js', () => ({ env: envMock }))
vi.mock('./pgStore.js', () => pgMock)
vi.mock('./store.js', () => sqliteMock)

const { createStore } = await import('./storeFactory.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('storeFactory', () => {
  test('should select sqlite by default', async () => {
    envMock.STORE_BACKEND = 'sqlite'
    sqliteMock.createSqliteStore.mockReturnValue({ name: 'sqlite-store' })
    const store = await createStore()
    expect(sqliteMock.createSqliteStore).toHaveBeenCalledWith('./rag.db')
    expect(store).toEqual({ name: 'sqlite-store' })
    expect(pgMock.createPgStore).not.toHaveBeenCalled()
  })

  test('should select postgres when configured', async () => {
    envMock.STORE_BACKEND = 'postgres'
    pgMock.createPgStore.mockResolvedValue({ name: 'pg-store' })
    const store = await createStore()
    expect(pgMock.createPgStore).toHaveBeenCalledTimes(1)
    expect(store).toEqual({ name: 'pg-store' })
    expect(sqliteMock.createSqliteStore).not.toHaveBeenCalled()
  })
})
