import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './config';

const validUrl = 'postgresql://app:fake-password-for-tests@localhost:5432/app';
const fakeSecret = 'fake-auth-secret-for-tests-0123456789abcdef';

const base = {
  DATABASE_URL: validUrl,
  BETTER_AUTH_SECRET: fakeSecret,
  BETTER_AUTH_URL: 'http://localhost:3000/',
  GOOGLE_CLIENT_ID: 'fake-client-id',
  GOOGLE_CLIENT_SECRET: 'fake-client-secret-for-tests',
};

describe('parseConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    expect(parseConfig(base)).toEqual({
      nodeEnv: 'development',
      database: { url: validUrl, poolMax: 10 },
      auth: {
        secret: fakeSecret,
        baseUrl: 'http://localhost:3000',
        googleClientId: 'fake-client-id',
        googleClientSecret: 'fake-client-secret-for-tests',
      },
      allowedEmails: [],
      e2eAuthBypass: false,
    });
  });

  it('accepts the postgres:// scheme and coerces numeric values', () => {
    const config = parseConfig({ ...base, NODE_ENV: 'test', DATABASE_URL: 'postgres://app@localhost/app_test', DATABASE_POOL_MAX: '3' });
    expect(config.nodeEnv).toBe('test');
    expect(config.database.poolMax).toBe(3);
  });

  it('splits ALLOWED_EMAILS and drops empty entries', () => {
    expect(parseConfig({ ...base, ALLOWED_EMAILS: ' a@example.com, ,b@example.com,' }).allowedEmails).toEqual(['a@example.com', 'b@example.com']);
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: undefined }],
    ['DATABASE_URL', { DATABASE_URL: 'mysql://app:pw@localhost/app' }],
    ['DATABASE_POOL_MAX', { DATABASE_POOL_MAX: '0' }],
    ['BETTER_AUTH_SECRET', { BETTER_AUTH_SECRET: 'too-short' }],
    ['BETTER_AUTH_URL', { BETTER_AUTH_URL: 'ftp://example.com' }],
    ['GOOGLE_CLIENT_ID', { GOOGLE_CLIENT_ID: ' ' }],
    ['GOOGLE_CLIENT_SECRET', { GOOGLE_CLIENT_SECRET: undefined }],
    ['E2E_AUTH_BYPASS', { E2E_AUTH_BYPASS: 'yes' }],
  ])('rejects an invalid %s', (variable, override) => {
    expect(() => parseConfig({ ...base, ...override })).toThrow(ConfigError);
    expect(() => parseConfig({ ...base, ...override })).toThrow(new RegExp(variable));
  });

  it('enables the E2E auth bypass only with NODE_ENV=test', () => {
    expect(parseConfig({ ...base, NODE_ENV: 'test', E2E_AUTH_BYPASS: 'true' }).e2eAuthBypass).toBe(true);
    expect(parseConfig({ ...base, NODE_ENV: 'test' }).e2eAuthBypass).toBe(false);
    expect(() => parseConfig({ ...base, NODE_ENV: 'production', E2E_AUTH_BYPASS: 'true' })).toThrow(/E2E_AUTH_BYPASS/);
    expect(() => parseConfig({ ...base, NODE_ENV: 'development', E2E_AUTH_BYPASS: 'true' })).toThrow(/E2E_AUTH_BYPASS/);
  });

  it('never includes variable values in the error message', () => {
    try {
      parseConfig({ ...base, NODE_ENV: 'staging-fake-password-for-tests', BETTER_AUTH_SECRET: 'short-secret-value' });
      expect.unreachable();
    }
    catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(String(error)).not.toContain('fake-password-for-tests');
      expect(String(error)).not.toContain('short-secret-value');
    }
  });
});
