import { env } from '../config.js'
import type { Store } from '../types.js'
import { createPgStore } from './pg-store.js'
import { createSqliteStore } from './store.js'

/**
 * Pluggable store selection. SQLite is the default (standalone); PostgreSQL is
 * opt-in via STORE_BACKEND=postgres and a reachable connection. Callers only
 * ever see the Store interface.
 */
export const createStore = async (): Promise<Store> => {
  if (env.STORE_BACKEND === 'postgres') return createPgStore()
  return createSqliteStore(env.DB_PATH)
}
