import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.MCP_API_KEY = process.env.MCP_API_KEY || 'test-secret-key'
process.env.VERSION = process.env.VERSION || 'test-version'

// A single real temp dir shared by the whole run. `ingest.ts` reads KB_ROOT at
// module load, so it must be stable before any test module is imported.
const kbRoot = mkdtempSync(join(tmpdir(), 'rag-kbs-root-'))
process.env.KB_ROOT = kbRoot

process.on('exit', () => {
  rmSync(kbRoot, { recursive: true, force: true })
})
