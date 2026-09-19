import { env } from '../shared/config.js'
import type { JobQueue, Store } from '../shared/types.js'
import { createPgJobQueue } from './postgres/job-queue.js'
import { createPgStore } from './postgres/store.js'
import { createSqliteJobQueue } from './sqlite/job-queue.js'
import { createSqliteStore } from './sqlite/store.js'

export const createStore = async (): Promise<Store> => {
  if (env.STORE_BACKEND === 'postgres') return createPgStore()
  return createSqliteStore(env.DB_PATH)
}

export const createJobQueue = async (): Promise<JobQueue> => {
  if (env.STORE_BACKEND === 'postgres') return createPgJobQueue()
  return createSqliteJobQueue(env.DB_PATH)
}
