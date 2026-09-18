import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Store } from "../../types";
import { stubLlmApi, unitEmbeddings, writeKbDocument } from "../helpers";

/**
 * End-to-end use case for contextual chunking. When the feature is enabled, a
 * lightweight LLM generates a context sentence per chunk that is prepended to
 * the chunk ONLY for embedding. Stored content must stay unchanged, and search
 * must still retrieve the chunk.
 *
 * config.ts parses env at module load, so these modules are re-imported with
 * CONTEXTUAL_CHUNKING_ENABLED=true (same pattern as config.unit.test.ts).
 */
describe("contextual chunking end-to-end", () => {
  let root: string;
  let store: Store;
  let restoreFetch: (() => void) | undefined;

  const setupEnv = () => {
    process.env.CONTEXTUAL_CHUNKING_ENABLED = "true";
    process.env.CONTEXTUAL_CHUNKING_BASE_URL = "http://llm-test/v1";
    process.env.CONTEXTUAL_CHUNKING_MODEL = "llm-test-model";
  };

  const importModules = async () => {
    const { scanAll } = await import("../../core/ingest");
    const { search } = await import("../../core/search");
    const { createSqliteStore } = await import("../../core/store");
    return { scanAll, search, createSqliteStore };
  };

  afterEach(async () => {
    restoreFetch?.();
    await store?.close();
    if (root) rmSync(root, { recursive: true, force: true });
    delete process.env.CONTEXTUAL_CHUNKING_ENABLED;
    delete process.env.CONTEXTUAL_CHUNKING_BASE_URL;
    delete process.env.CONTEXTUAL_CHUNKING_MODEL;
  });

  test("should enrich embeddings with a generated context without altering stored content", async () => {
    setupEnv();
    vi.resetModules();

    const embeddedTexts: string[] = [];
    const chatCalls: Array<{ content: string }> = [];
    restoreFetch = stubLlmApi(
      (texts) => {
        // Collect the enriched texts sent to the embeddings endpoint so we can
        // assert that the context sentence was prepended.
        embeddedTexts.push(...texts);
        return texts.map(() => unitEmbeddings(4));
      },
      (payload) => {
        chatCalls.push(
          payload.messages[payload.messages.length - 1] ?? { content: "" },
        );
        return "This fragment details the API v2 rate limits.";
      },
    );

    const { scanAll, search, createSqliteStore } = await importModules();
    const { createSyncTestQueue } = await import("../helpers");

    root = mkdtempSync(join(tmpdir(), "rag-ctx-"));
    store = createSqliteStore(
      join(mkdtempSync(join(tmpdir(), "rag-ctx-db-")), "rag.db"),
    );

    writeKbDocument(
      root,
      "kb1",
      "api.md",
      "# Rate limits\n\nthe API v2 enforces a limit of 100 requests per minute",
    );

    const queue = createSyncTestQueue(store, root);
    const result = await scanAll(store, queue, root);
    expect(result.added).toBe(1);

    // 1. The LLM was asked to generate a context sentence per chunk.
    expect(chatCalls.length).toBeGreaterThan(0);
    expect(embeddedTexts.length).toBeGreaterThan(0);

    // 2. The embeddings endpoint received the enriched text (context + chunk).
    for (const text of embeddedTexts) {
      expect(text).toContain("This fragment details the API v2 rate limits.");
    }

    // 3. The stored chunk content is the original, un-enriched text.
    const chunks = await store.getAllChunks("kb1");
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.content).toContain("100 requests per minute");
      expect(c.content).not.toContain(
        "This fragment details the API v2 rate limits.",
      );
    }

    // 4. Search still retrieves the chunk through the enriched embedding.
    const found = await search(store, {
      query: "rate limit",
      kb: "kb1",
      topK: 5,
    });
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].content).toContain("100 requests per minute");
  });
});
