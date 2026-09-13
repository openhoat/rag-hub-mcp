import { defineConfig } from 'vitest/config'

/**
 * Two test projects:
 *  - unit         -> src/** /*.unit.test.ts          (pure/fast, mocked deps)
 *  - e2e          -> src/e2e/** /*.e2e.test.ts         (real disk + SQLite + HTTP)
 *
 * Default `vitest run` (script `test`) runs BOTH, keeping the validate gate
 * comprehensive. Filter on demand with `vitest run --project unit` or
 * `vitest run --project e2e` (scripts `test:unit` / `test:e2e`).
 */
const shared = {
  environment: 'node',
  setupFiles: ['./vitest.setup.ts'],
}

export default defineConfig({
  test: {
    projects: [
      { test: { ...shared, name: 'unit', include: ['src/**/*.unit.test.ts'] } },
      {
        test: {
          ...shared,
          name: 'e2e',
          include: ['src/e2e/**/*.e2e.test.ts'],
          // Threads + a single worker keeps the native better-sqlite3 addon in
          // one clean worker for the whole suite. Fork teardown races the
          // N-API cleanup hooks during worker process exit
          // (RemoveEnvironmentCleanupHook SIGABRT). Per-file isolation
          // (isolate: true, default) stops module state leaking between files.
          pool: 'threads',
          maxWorkers: 1,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'dist/coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/testing/helpers.ts',
        'src/index.ts',
        'src/log.ts',
        // PostgreSQL backend validated by its own e2e (src/e2e/pgstore.e2e.test.ts)
        // against a real pgvector server; skipped (and uncovered) when Postgres
        // is not running. The pluggable factory is covered together with it.
        'src/core/pgStore.ts',
        'src/core/storeFactory.ts',
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
})
