// Evaluated before any other module that reads environment defaults.
// Local stdio mode uses cwd-relative paths; HTTP mode keeps the container paths.
// ESM evaluates top-level imports in source order, so index.ts imports this
// first and ingest.ts (which reads KB_ROOT at load time) then sees the right
// value depending on transport mode.
if (!process.argv.includes('--http') && process.env.RAG_TRANSPORT !== 'http') {
  if (process.env.KB_ROOT === undefined) process.env.KB_ROOT = './kbs'
  if (process.env.DB_PATH === undefined) process.env.DB_PATH = './rag.db'
}
