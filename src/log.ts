// In stdio transport, stdout carries JSON-RPC — all logging must go to stderr.
const isStdio = !process.argv.includes('--http') && process.env.RAG_TRANSPORT !== 'http'

export function getLogger(name: string) {
  return {
    info: (msg: string, ...args: unknown[]) =>
      isStdio ? console.error(`[${name}] ${msg}`, ...args) : console.log(`[${name}] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) =>
      isStdio ? console.error(`[${name}] ${msg}`, ...args) : console.warn(`[${name}] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(`[${name}] ${msg}`, ...args),
  }
}
