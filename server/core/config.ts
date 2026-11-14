import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).default('false').transform(value => value === 'true');

// Variables are added here together with the features that need them.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// or postgresql:// URL' }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/, error: 'must be an http:// or https:// URL' }),
  GOOGLE_CLIENT_ID: z.string().trim().min(1, 'is required'),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1, 'is required'),
  ALLOWED_EMAILS: z.string().default(''),
  E2E_AUTH_BYPASS: booleanFlag,
});

export type AppConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  database: Readonly<{ url: string; poolMax: number }>;
  auth: Readonly<{
    secret: string;
    baseUrl: string;
    googleClientId: string;
    googleClientSecret: string;
  }>;
  /** Raw ALLOWED_EMAILS entries; validated and normalized by the identity module. */
  allowedEmails: readonly string[];
  /** True only when NODE_ENV=test and E2E_AUTH_BYPASS=true (see parseConfig). */
  e2eAuthBypass: boolean;
}>;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/**
 * Parses configuration from an environment record. Error messages name the
 * offending variables but never include their values, because values such as
 * DATABASE_URL or BETTER_AUTH_SECRET are credentials.
 */
export function parseConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid environment configuration. ${details}`);
  }
  const parsed = result.data;

  // AGENTS.md security rule 9. The bypass route is also absent from production
  // builds (it is only compiled into the e2e build), so this is a second layer.
  if (parsed.E2E_AUTH_BYPASS && parsed.NODE_ENV !== 'test') {
    throw new ConfigError('Invalid environment configuration. E2E_AUTH_BYPASS: may only be enabled when NODE_ENV=test');
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    database: { url: parsed.DATABASE_URL, poolMax: parsed.DATABASE_POOL_MAX },
    auth: {
      secret: parsed.BETTER_AUTH_SECRET,
      baseUrl: new URL(parsed.BETTER_AUTH_URL).origin,
      googleClientId: parsed.GOOGLE_CLIENT_ID,
      googleClientSecret: parsed.GOOGLE_CLIENT_SECRET,
    },
    allowedEmails: parsed.ALLOWED_EMAILS.split(',').map(entry => entry.trim()).filter(entry => entry !== ''),
    e2eAuthBypass: parsed.E2E_AUTH_BYPASS,
  };
}
