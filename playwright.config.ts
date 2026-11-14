import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { requireTestDatabaseUrl } from './tests/support/test-database';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

// E2E runs against the e2e build (`nuxt build --envName e2e`, output in
// .output-e2e), the only build containing the test-session route, and the test
// database. Every user flow runs at a desktop and a mobile viewport; HTTP-level
// API checks run once (desktop project).
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
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /api\.spec\.ts$/ },
  ],
  webServer: {
    command: 'node .output-e2e/server/index.mjs',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: requireTestDatabaseUrl(),
      BETTER_AUTH_URL: baseURL,
      // Random per run; never a real secret. Google is never contacted in E2E.
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
      GOOGLE_CLIENT_ID: 'e2e-google-client-id',
      GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret',
      ALLOWED_EMAILS: '',
      E2E_AUTH_BYPASS: 'true',
    },
  },
});
