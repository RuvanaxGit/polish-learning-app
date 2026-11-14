import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../../server/core/config';
import { parseConfig } from '../../server/core/config';
import { requireTestDatabaseUrl } from './test-database';

export const TEST_BASE_URL = 'http://localhost:3000';

/**
 * Config for integration tests. Secrets are random per process and Google
 * credentials are obvious placeholders: tests never talk to Google.
 */
export function createTestConfig(overrides: Readonly<Record<string, string>> = {}): AppConfig {
  return parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: requireTestDatabaseUrl(),
    DATABASE_POOL_MAX: '4',
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    BETTER_AUTH_URL: TEST_BASE_URL,
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    ...overrides,
  });
}
