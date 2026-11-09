import { z } from 'zod'

// Phase 1 only parses what the foundation uses. Auth, LLM, and quota variables
// are added here together with the features that need them.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// or postgresql:// URL' }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
})

export type AppConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production'
  database: Readonly<{ url: string, poolMax: number }>
}>

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

/**
 * Parses configuration from an environment record. Error messages name the
 * offending variables but never include their values, because values such as
 * DATABASE_URL contain credentials.
 */
export function parseConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const details = result.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new ConfigError(`Invalid environment configuration. ${details}`)
  }
  const parsed = result.data
  return {
    nodeEnv: parsed.NODE_ENV,
    database: { url: parsed.DATABASE_URL, poolMax: parsed.DATABASE_POOL_MAX },
  }
}
