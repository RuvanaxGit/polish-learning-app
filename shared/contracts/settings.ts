import { z } from 'zod'

export const translationLanguages = ['ru', 'en', 'uk'] as const
export const uiLocales = ['en'] as const
export const DEFAULT_TIMEZONE = 'Europe/Warsaw'

export const DAILY_NEW_LIMIT_MIN = 0
export const DAILY_NEW_LIMIT_MAX = 200
export const DESIRED_RETENTION_MIN = 0.7
export const DESIRED_RETENTION_MAX = 0.97

export function isValidTimeZone(value: string): boolean {
  try {
    // Throws RangeError for names the runtime's IANA database doesn't know.
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  }
  catch {
    return false
  }
}

const hasAtMostTwoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9

export const translationLanguageSchema = z.enum(translationLanguages)
export const uiLocaleSchema = z.enum(uiLocales)
export const timezoneSchema = z.string().min(1).max(64).refine(isValidTimeZone, 'Unknown time zone')
export const dailyNewLimitSchema = z.int().min(DAILY_NEW_LIMIT_MIN).max(DAILY_NEW_LIMIT_MAX)
export const desiredRetentionSchema = z.number()
  .min(DESIRED_RETENTION_MIN)
  .max(DESIRED_RETENTION_MAX)
  .refine(hasAtMostTwoDecimals, 'Use at most two decimal places')

export const settingsSchema = z.object({
  uiLocale: uiLocaleSchema,
  translationLanguage: translationLanguageSchema,
  /** Null until the browser has reported its time zone. */
  timezone: z.string().nullable(),
  /** The time zone used for local-day logic: `timezone` or the default. */
  effectiveTimezone: z.string(),
  dailyNewLimit: z.int(),
  desiredRetention: z.number(),
})

export type Settings = z.infer<typeof settingsSchema>

export const updateSettingsRequestSchema = z.object({
  uiLocale: uiLocaleSchema.optional(),
  translationLanguage: translationLanguageSchema.optional(),
  timezone: timezoneSchema.optional(),
  dailyNewLimit: dailyNewLimitSchema.optional(),
  desiredRetention: desiredRetentionSchema.optional(),
}).strict().refine(body => Object.values(body).some(value => value !== undefined), 'At least one setting is required')

export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>
