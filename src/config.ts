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
  KB_ROOT: z.string().default(isHttp ? '/data/kbs' : './kbs'),
  DB_PATH: z.string().default(isHttp ? '/data/index/rag.db' : './rag.db'),
  SCAN_INTERVAL: z.coerce.number().int().min(0).default(300),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  CORS_ORIGINS: z.string().default(''),
  RAG_VERSION: z.string().default('0.0.1'),
  RAG_TRANSPORT: z.enum(['stdio', 'http']).optional(),
  RAG_LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  MCP_SESSION_TTL_SECONDS: z.coerce.number().int().min(0).default(1800),
  MCP_SESSION_MAX: z.coerce.number().int().min(1).default(100),
  MCP_SESSION_CREATE_RATE_PER_MINUTE: z.coerce.number().int().min(1).default(30),
})

export const env = EnvSchema.parse(process.env)

/** True when serving the streamable-http/REST transport instead of stdio. */
export const isHttpMode = isHttp

/** CORS origins as an array (empty string -> empty list). */
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Transport-mode guard, kept pure so it can be unit-tested without triggering
// the top-level server bootstrap in index.ts.
export const requireHttpApiKey = (isHttp: boolean, apiKey: string): boolean => {
  return !isHttp || apiKey.trim() !== ''
}
