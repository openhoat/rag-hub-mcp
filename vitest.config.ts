import { defineConfig } from 'vitest/config'

/**
 * Two test projects:
 *  - unit         -> src/** /*.unit.test.ts          (pure/fast, mocked deps)
 *  - e2e          -> src/test/e2e/** /*.e2e.test.ts  (real disk + SQLite + HTTP)
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
          include: ['src/test/e2e/**/*.e2e.test.ts'],
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
        'src/test/helpers.ts',
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 75,
        functions: 60,
        branches: 65,
        statements: 75,
      },
    },
  },
})
