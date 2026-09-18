import { env } from '../config.js'
import type { JobQueue } from '../types.js'
import { createPgJobQueue } from './pg-job-queue.js'
import { createSqliteJobQueue } from './sqlite-job-queue.js'

export const createJobQueue = async (): Promise<JobQueue> => {
  if (env.STORE_BACKEND === 'postgres') return createPgJobQueue()
  return createSqliteJobQueue(env.DB_PATH)
}
