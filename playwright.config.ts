import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { requireTestDatabaseUrl } from './tests/support/test-database'

if (existsSync('.env')) process.loadEnvFile('.env')

const port = 3100
const baseURL = `http://127.0.0.1:${port}`

// E2E runs against the production build (`pnpm test:e2e` builds first) and the
// test database. Every flow is checked at a desktop and a mobile viewport.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node .output/server/index.mjs',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: requireTestDatabaseUrl(),
    },
  },
})
