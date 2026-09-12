import { defineConfig } from 'vitest/config'

/**
 * Two test projects:
 *  - unit         -> src/** /*.unit.test.ts          (pure/fast, mocked deps)
 *  - e2e          -> e2e-tests/** /*.e2e.test.ts      (real disk + SQLite + HTTP)
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
      { test: { ...shared, name: 'e2e', include: ['e2e-tests/**/*.e2e.test.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'dist/coverage',
      include: ['src/*.ts'],
      exclude: ['src/*.test.ts', 'src/test-helpers.ts', 'src/index.ts', 'src/log.ts'],
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
