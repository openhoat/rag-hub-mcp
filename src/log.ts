import { pino } from 'pino'
import { env } from './config.js'

// Writes to stderr on both transports: in stdio, stdout carries JSON-RPC so any
// log on fd 1 would corrupt the protocol. Pretty printing is enabled in
// development (NODE_ENV=development); otherwise output is structured JSON.
interface LogMethods {
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
}

const base = pino({
  level: env.RAG_LOG_LEVEL,
  base: undefined,
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : { destination: 2 }),
})

export const getLogger = (name: string): LogMethods => {
  const child = base.child({ module: name })
  // pino's overloads are too strict for rest args (unknown[]); widen to a plain
  // variadic so call sites can pass errors/extra values freely.
  const emit = (fn: (msg: string, ...args: unknown[]) => void, msg: string, args: unknown[]): void => {
    ;(fn as (msg: string, ...a: unknown[]) => void)(msg, ...args)
  }
  return {
    info: (msg, ...args) => emit(child.info.bind(child), msg, args),
    warn: (msg, ...args) => emit(child.warn.bind(child), msg, args),
    error: (msg, ...args) => emit(child.error.bind(child), msg, args),
  }
}
