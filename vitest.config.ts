import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Vitest only exposes VITE_* variables by itself. Variables already set in
// the environment take precedence over the file.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['server/core/**/*.test.ts', 'shared/**/*.test.ts'],
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
})
