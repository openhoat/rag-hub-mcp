import { mkdirSync, writeFileSync } from "node:fs";
import type { Server as HttpServer } from "node:http";
import { dirname, join } from "node:path";
import type { PGliteInterface } from "@electric-sql/pglite";
import { PGlite } from "@electric-sql/pglite";
import { vector as pgliteVector } from "@electric-sql/pglite-pgvector";
import type { FastifyInstance } from "fastify";
import { indexFile } from "../core/ingest.js";
import { createPgStoreFromDb, type Db } from "../core/pg-store";
import type {
  ChunkRecord,
  JobQueue,
  JobStats,
  KbInfo,
  NewJob,
  Store,
  Worker,
} from "../types";

/**
 * Bridge an in-memory PGlite (real Postgres compiled to WASM + pgvector) to the
 * `Db` interface consumed by PgStore, so the PostgreSQL backend can be tested
 * without any server or docker.
 */
export const pgliteToDb = (p: PGliteInterface): Db => ({
  query: async <
    TResult extends Record<string, unknown> = { [k: string]: unknown },
  >(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: TResult[] }> => {
    const res = await p.query<TResult>(sql, params);
    return { rows: res.rows };
  },
  exec: async (sql: string): Promise<void> => {
    await p.exec(sql);
  },
  transaction: async <T>(
    fn: (client: { query: Db["query"] }) => Promise<T>,
  ): Promise<T> => {
    return p.transaction(async (tx) => {
      return fn({ query: tx.query.bind(tx) });
    });
  },
  close: async (): Promise<void> => {
    await p.close();
  },
});

/** Create an in-memory PostgreSQL store backed by PGlite (+ pgvector). */
export const createPgliteStore = async (dimension = 4): Promise<Store> => {
  const db = new PGlite({ extensions: { vector: pgliteVector } });
  return createPgStoreFromDb(pgliteToDb(db), dimension);
};

export const writeKbDocument = (
  root: string,
  kb: string,
  relPath: string,
  content: string,
): void => {
  const full = join(root, kb, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf-8");
};

export const makeChunk = (
  id: number,
  kb: string,
  content: string,
  embedding?: number[],
): ChunkRecord => {
  return {
    id,
    fileId: id,
    chunkIndex: 0,
    content,
    metadata: JSON.stringify({ kb, path: `${kb}/file.md`, headings: "" }),
    embedding: embedding ? Float32Array.from(embedding) : null,
  };
};

export const makeStubStore = (overrides: Partial<Store> = {}): Store => {
  const defaultKbs: KbInfo[] = [
    { name: "kb", docCount: 1, chunkCount: 2, totalBytes: 42 },
  ];
  return {
    close: async () => {},
    listKbs: async () => defaultKbs,
    listFiles: async () => [
      { relPath: "a.md", sha256: "x", mtime: 1, bytes: 42, chunkCount: 2 },
    ],
    getFile: async () => null,
    upsertFile: async () => 0,
    deleteFile: async () => {},
    deleteFilesByKb: async () => {},
    getKbId: async () => 0,
    addKb: async () => {},
    removeKb: async () => {},
    insertChunk: async () => 0,
    deleteChunks: async () => {},
    getAllChunks: async () => [],
    purgeKb: async () => {},
    updateFileMtime: async () => {},
    listAllKbs: async () => [],
    getKbName: async () => "?",
    listKnownFiles: async () => [],
    searchFts: async () => null,
    hasNullEmbeddings: async () => false,
    ...overrides,
  };
};

export const makeStubQueue = (overrides: Partial<JobQueue> = {}): JobQueue => ({
  enqueue: async (_jobs: NewJob[]) => {},
  claim: async (_limit: number) => [],
  complete: async (_id: number) => {},
  fail: async (_id: number, _error: string) => {},
  reclaimStale: async (_timeoutSeconds: number) => 0,
  stats: async (): Promise<JobStats> => ({
    pending: 0,
    processing: 0,
    failed: 0,
  }),
  failedList: async (_limit?: number) => [],
  retryJob: async (_id: number) => {},
  clear: async () => {},
  clearForKb: async (_kb: string) => {},
  clearForFile: async (_kb: string, _relPath: string) => {},
  close: async () => {},
  ...overrides,
});

export const makeStubWorker = (overrides: Partial<Worker> = {}): Worker => ({
  start: () => {},
  stop: async () => {},
  drain: async () => {},
  ...overrides,
});

/**
 * Create a synchronous test queue that processes index jobs immediately on
 * enqueue (calls indexFile directly). Preserves the old synchronous scanAll
 * behaviour for e2e tests without a background worker.
 */
export const createSyncTestQueue = (store: Store, root: string): JobQueue => {
  const enqueue = async (jobs: NewJob[]): Promise<void> => {
    for (const j of jobs) {
      const fullPath = join(root, j.kb, j.relPath);
      const kbId = await store.getKbId(j.kb);
      if (!kbId) continue;
      if (!fullPath) continue;
      await indexFile(store, kbId, j.relPath, fullPath, j.sha256, {
        mtimeMs: j.mtime,
        size: j.bytes,
      }).catch(() => {});
    }
  };
  return {
    enqueue,
    claim: async () => [],
    complete: async () => {},
    fail: async () => {},
    reclaimStale: async () => 0,
    stats: async () => ({ pending: 0, processing: 0, failed: 0 }),
    failedList: async () => [],
    retryJob: async () => {},
    clear: async () => {},
    clearForKb: async () => {},
    clearForFile: async () => {},
    close: async () => {},
  };
};

/** Minimal IngestResult that TypeScript accepts for tests constructing their own. */
export const zeroResult = {
  added: 0,
  modified: 0,
  deleted: 0,
  skipped: 0,
  excluded: 0,
  enqueued: 0,
};

export const startHttpServer = async (
  app: FastifyInstance,
): Promise<{ server: HttpServer; base: string }> => {
  await app.ready();
  await app.listen({ port: 0 });
  const server = app.server;
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("no port assigned");
  return { server, base: `http://127.0.0.1:${address.port}` };
};

/**
 * Resolve the string form of a fetch input without a nested ternary (Sonar S3358).
 */
const resolveUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

/**
 * Normalize an OpenAI/Ollama `input` payload to a flat string array.
 */
const normalizeInput = (payload: { input?: string | string[] }): string[] => {
  if (Array.isArray(payload.input)) return payload.input;
  if (typeof payload.input === "string") return [payload.input];
  return [];
};

/**
 * Stub the global fetch so that ONLY requests to an OpenAI/Ollama-compatible
 * `/embeddings` endpoint are intercepted. All other requests (including the
 * test's own calls to a local HTTP server) pass through to the real fetch.
 *
 * `makeEmbeddings` receives the array of input texts and must return one
 * embedding per text (dimension chosen by the caller). Returns a restore fn.
 */
export const stubEmbeddingsApi = (
  makeEmbeddings: (inputTexts: string[]) => number[][],
): (() => void) => {
  return stubLlmApi(makeEmbeddings);
};

/** Deterministic unit vectors that give cosine similarity ~1 between any pair. */
export const unitEmbeddings = (dimension = 4): number[] => {
  return Array.from({ length: dimension }, (_, i) => (i === 0 ? 1 : 0));
};

/**
 * Stub the global fetch so that ONLY `/embeddings` and `/chat/completions`
 * OpenAI/Ollama-compatible endpoints are intercepted. All other requests
 * (including the test's own calls to a local HTTP server) pass through to the
 * real fetch.
 *
 * `makeEmbeddings` receives the array of input texts and must return one
 * embedding per text. `makeContext` receives the chat payload and must return a
 * context sentence. Returns a restore fn.
 */
export const stubLlmApi = (
  makeEmbeddings: (inputTexts: string[]) => number[][],
  makeContext?: (payload: { messages: Array<{ content: string }> }) => string,
): (() => void) => {
  const prev = globalThis.fetch;
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = resolveUrl(input);
    if (url.endsWith("/embeddings")) {
      const rawBody = init?.body;
      const payload =
        typeof rawBody === "string"
          ? (JSON.parse(rawBody) as { input?: string | string[] })
          : { input: [] };
      const texts = normalizeInput(payload);
      const embeddings = makeEmbeddings(texts);
      return new Response(
        JSON.stringify({ data: embeddings.map((e) => ({ embedding: e })) }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.endsWith("/chat/completions")) {
      const rawBody = init?.body;
      const payload =
        typeof rawBody === "string"
          ? (JSON.parse(rawBody) as { messages: Array<{ content: string }> })
          : { messages: [] };
      const content = makeContext
        ? makeContext(payload)
        : "context sentence stub";
      return new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return prev(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = prev;
  };
};
