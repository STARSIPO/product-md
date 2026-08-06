import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Unit + integration tests.
 *
 * Aliases are declared here rather than via vite-tsconfig-paths: that plugin is
 * ESM-only and this config is loaded through require, so it cannot be imported. Two
 * entries are cheaper than the workaround.
 *
 * `server-only` is aliased to a no-op — it exists so Next fails the build when a
 * server module leaks into a client bundle, but under Vitest there is no such boundary
 * and its default export throws on import.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup/env.ts'],
    globalSetup: ['./tests/setup/global.ts'],
    // Integration tests share one SQLite file; parallel writers would deadlock.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
