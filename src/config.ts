import { z } from 'zod'

// Central environment schema. Parsed once at module load (fail-fast with a
// clear Zod error) and coerced to proper types, so call sites never read
// process.env or hand-parse ints.
//
// Filesystem defaults depend on the transport mode: stdio runs from the local
// cwd (relative paths), HTTP runs in a container (fixed paths).
const isHttp = process.argv.includes('--http') || process.env.RAG_TRANSPORT === 'http'

const EnvSchema = z.object({
  MCP_API_KEY: z.string().default(''),
  EMBEDDINGS_BASE_URL: z.string().default('http://localhost:11434/v1'),
  EMBEDDINGS_API_KEY: z.string().default(''),
  EMBEDDINGS_MODEL: z.string().default('bge-m3'),
  EMBEDDINGS_DIMENSION: z.coerce.number().int().min(1).default(1024),
  CHUNK_MAX_CHARS: z.coerce.number().int().min(1).default(3200),
  STORE_BACKEND: z.enum(['sqlite', 'postgres']).default('sqlite'),
  DATABASE_URL: z.string().optional(),
  PG_HOST: z.string().optional(),
  PG_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  PG_DATABASE: z.string().optional(),
  PG_USER: z.string().optional(),
  PG_PASSWORD: z.string().optional(),
  PG_SSL: z
    .enum(['true', 'false'])
    .optional()
    .transform(v => (v === undefined ? false : v === 'true')),
  KB_ROOT: z.string().default(isHttp ? '/data/kbs' : './kbs'),
  DB_PATH: z.string().default(isHttp ? '/data/index/rag.db' : './rag.db'),
  SCAN_INTERVAL: z.coerce.number().int().min(0).default(300),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  CORS_ORIGINS: z.string().default(''),
  // Additional text file extensions to index, comma-separated (e.g. ".kt,.java").
  // Merged with the built-in list at extract time, not a replacement.
  TEXT_EXTENSIONS: z.string().default(''),
  VERSION: z.string().default('1.2.0'),
  RAG_TRANSPORT: z.enum(['stdio', 'http']).optional(),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  MCP_SESSION_TTL_SECONDS: z.coerce.number().int().min(0).default(1800),
  MCP_SESSION_MAX: z.coerce.number().int().min(1).default(100),
  MCP_SESSION_CREATE_RATE_PER_MINUTE: z.coerce.number().int().min(1).default(30),
})

export const env = EnvSchema.parse(process.env)

/** Names of every variable in the env schema, for tests to isolate process.env. */
export const ENV_KEYS: readonly string[] = Object.keys(EnvSchema.shape)

/** True when serving the streamable-http/REST transport instead of stdio. */
export const isHttpMode = isHttp

/** CORS origins as an array (empty string -> empty list). */
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map(s => s.trim())
  .filter(Boolean)

/** Additional text extensions as a normalized set (empty string -> empty set).
 * Each entry is lowercased and dot-prefixed so `.kt` and `kt` both match the
 * `extname()` format used at scan time. */
export const extraTextExtensions: ReadonlySet<string> = new Set(
  env.TEXT_EXTENSIONS.split(',')
    .map(s => {
      const ext = s.trim().toLowerCase()
      return ext.startsWith('.') ? ext : `.${ext}`
    })
    .filter(ext => ext.length > 1),
)

// Transport-mode guard, kept pure so it can be unit-tested without triggering
// the top-level server bootstrap in index.ts.
export const requireHttpApiKey = (isHttp: boolean, apiKey: string): boolean => {
  return !isHttp || apiKey.trim() !== ''
}
