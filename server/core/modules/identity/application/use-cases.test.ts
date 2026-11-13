import { describe, expect, it } from 'vitest'
import { ValidationError } from '../../../shared/errors'
import type { SettingsChanges, UserSettings } from '../domain/settings'
import type { AllowlistRepository, UserSettingsRepository } from './ports'
import { getSettings, isEmailAllowed, isUserAllowed, seedAllowlist, updateSettings } from './use-cases'

function fakeAllowlist(initial: string[] = [], users: Record<string, string> = {}): AllowlistRepository & { emails: Set<string> } {
  const emails = new Set(initial)
  return {
    emails,
    contains: async email => emails.has(email),
    containsUser: async userId => emails.has(users[userId]?.toLowerCase() ?? ''),
    addMissing: async (candidates) => {
      const before = emails.size
      candidates.forEach(email => emails.add(email))
      return emails.size - before
    },
  }
}

function fakeSettings(): UserSettingsRepository & { rows: Map<string, UserSettings> } {
  const rows = new Map<string, UserSettings>()
  const defaults = (userId: string): UserSettings => ({
    userId, uiLocale: 'en', translationLanguage: 'ru', timezone: null, dailyNewLimit: 20, desiredRetention: 0.9,
  })
  const getOrCreate = async (userId: string) => {
    const existing = rows.get(userId) ?? defaults(userId)
    rows.set(userId, existing)
    return existing
  }
  return {
    rows,
    getOrCreate,
    update: async (userId: string, changes: SettingsChanges) => {
      const next = { ...(await getOrCreate(userId)), ...changes }
      rows.set(userId, next)
      return next
    },
  }
}

describe('allowlist use cases', () => {
  it('normalizes before checking and treats missing emails as not allowed', async () => {
    const check = isEmailAllowed(fakeAllowlist(['alice@example.com']))
    expect(await check(' ALICE@example.com')).toBe(true)
    expect(await check('bob@example.com')).toBe(false)
    expect(await check(null)).toBe(false)
    expect(await check(undefined)).toBe(false)
    expect(await check('garbage')).toBe(false)
  })

  it('checks users by their stored email', async () => {
    const check = isUserAllowed(fakeAllowlist(['alice@example.com'], { u1: 'Alice@example.com', u2: 'bob@example.com' }))
    expect(await check('u1')).toBe(true)
    expect(await check('u2')).toBe(false)
  })

  it('seeds valid, normalized, unique emails and reports invalid ones', async () => {
    const repo = fakeAllowlist(['alice@example.com'])
    expect(await seedAllowlist(repo)(['Alice@example.com', 'bob@example.com', 'bad'])).toEqual({ added: 1, invalidCount: 1 })
    expect([...repo.emails].sort()).toEqual(['alice@example.com', 'bob@example.com'])
  })

  it('does not touch the repository when there is nothing to seed', async () => {
    const repo = fakeAllowlist()
    repo.addMissing = async () => {
      throw new Error('should not be called')
    }
    expect(await seedAllowlist(repo)([])).toEqual({ added: 0, invalidCount: 0 })
  })
})

describe('settings use cases', () => {
  it('returns defaults with the fallback time zone', async () => {
    expect(await getSettings(fakeSettings())('u1')).toEqual({
      uiLocale: 'en', translationLanguage: 'ru', timezone: null, effectiveTimezone: 'Europe/Warsaw', dailyNewLimit: 20, desiredRetention: 0.9,
    })
  })

  it('applies valid changes for the given user only', async () => {
    const repo = fakeSettings()
    await updateSettings(repo)('u1', { dailyNewLimit: 0, timezone: 'Asia/Tokyo' })
    expect(repo.rows.get('u1')).toMatchObject({ dailyNewLimit: 0, timezone: 'Asia/Tokyo' })
    expect(repo.rows.has('u2')).toBe(false)
  })

  it('throws ValidationError with issue paths for invalid input', async () => {
    const repo = fakeSettings()
    const error = await updateSettings(repo)('u1', { dailyNewLimit: 500 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).issues.map(issue => issue.path)).toEqual(['dailyNewLimit'])
    expect(repo.rows.size).toBe(0)
  })
})
