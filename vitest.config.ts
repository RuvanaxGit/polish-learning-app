import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Vitest only exposes VITE_* variables by itself. Variables already set in
// the environment take precedence over the file.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          // tests/eval/*.test.ts are the offline checks of the LLM evaluation
          // harness (no network). Live, paid runs use vitest.eval.config.ts.
          include: ['server/core/**/*.test.ts', 'server/utils/**/*.test.ts', 'shared/**/*.test.ts', 'tests/eval/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'build',
          environment: 'node',
          // Inspects the production build in .output; run via `pnpm test:build`.
          include: ['tests/build/**/*.test.ts'],
          hookTimeout: 60_000,
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/global-setup.ts'],
          // One shared test database: run files one at a time.
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
