import { describe, expect, it } from 'vitest'
import { isValidTimeZone, updateSettingsRequestSchema } from './settings'

describe('updateSettingsRequestSchema', () => {
  it.each([
    { translationLanguage: 'uk' },
    { uiLocale: 'en' },
    { dailyNewLimit: 0 },
    { dailyNewLimit: 200 },
    { desiredRetention: 0.7 },
    { desiredRetention: 0.97 },
    { desiredRetention: 0.85 },
    { timezone: 'Europe/Warsaw' },
    { timezone: 'UTC' },
    { translationLanguage: 'en', dailyNewLimit: 50 },
  ])('accepts %j', (body) => {
    expect(updateSettingsRequestSchema.safeParse(body).success).toBe(true)
  })

  it.each([
    {},
    { dailyNewLimit: 201 },
    { dailyNewLimit: -1 },
    { dailyNewLimit: 2.5 },
    { dailyNewLimit: '20' },
    { desiredRetention: 0.69 },
    { desiredRetention: 0.971 },
    { desiredRetention: 0.855 },
    { translationLanguage: 'pl' },
    { uiLocale: 'uk' },
    { timezone: '' },
    { timezone: 'Not/AZone' },
    { timezone: 'x'.repeat(65) },
    { timezone: null },
    { translationLanguage: 'en', extra: true },
  ])('rejects %j', (body) => {
    expect(updateSettingsRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('isValidTimeZone', () => {
  it('knows IANA zones and rejects others', () => {
    expect(isValidTimeZone('Europe/Kyiv')).toBe(true)
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true)
    expect(isValidTimeZone('Europe/Atlantis')).toBe(false)
  })
})
