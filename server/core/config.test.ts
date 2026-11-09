import { describe, expect, it } from 'vitest'
import { ConfigError, parseConfig } from './config'

const validUrl = 'postgresql://app:fake-password-for-tests@localhost:5432/app'

describe('parseConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    expect(parseConfig({ DATABASE_URL: validUrl })).toEqual({
      nodeEnv: 'development',
      database: { url: validUrl, poolMax: 10 },
    })
  })

  it('accepts the postgres:// scheme and coerces numeric values', () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://app@localhost/app_test',
      DATABASE_POOL_MAX: '3',
    })
    expect(config.nodeEnv).toBe('test')
    expect(config.database.poolMax).toBe(3)
  })

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseConfig({})).toThrow(ConfigError)
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/)
  })

  it('rejects a non-postgres URL', () => {
    expect(() => parseConfig({ DATABASE_URL: 'mysql://app:pw@localhost/app' })).toThrow(/DATABASE_URL/)
  })

  it('rejects an out-of-range pool size', () => {
    expect(() => parseConfig({ DATABASE_URL: validUrl, DATABASE_POOL_MAX: '0' })).toThrow(/DATABASE_POOL_MAX/)
  })

  it('never includes variable values in the error message', () => {
    try {
      parseConfig({ DATABASE_URL: validUrl, NODE_ENV: 'staging-fake-password-for-tests' })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect(String(error)).not.toContain('fake-password-for-tests')
    }
  })
})
