import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The package version is the single source of truth for what the server
// reports over MCP/REST. It is read at runtime rather than imported: `tsc`
// does not copy package.json into dist/build, so an ESM JSON import would
// resolve correctly from `src/` but not from the built output. Walking up
// from this module finds the package root from both layouts (`src/shared/`
// and `dist/build/shared/`).
const findPackageJson = (start: string): string => {
  let dir = start
  while (true) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) throw new Error('package.json not found')
    dir = parent
  }
}

/** Version declared in the package's package.json (read once, then cached). */
export const packageVersion: string = (
  JSON.parse(readFileSync(findPackageJson(dirname(fileURLToPath(import.meta.url))), 'utf-8')) as {
    version: string
  }
).version
