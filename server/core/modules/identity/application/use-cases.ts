import { updateSettingsRequestSchema } from '../../../../../shared/contracts/settings'
import type { Settings } from '../../../../../shared/contracts/settings'
import { ValidationError } from '../../../shared/errors'
import { normalizeEmail, parseAllowlistEntries } from '../domain/email'
import { toSettingsView } from '../domain/settings'
import type { AllowlistRepository, UserSettingsRepository } from './ports'

export type SeedAllowlistResult = Readonly<{ added: number, invalidCount: number }>

export function isEmailAllowed(allowlist: AllowlistRepository) {
  return async (email: string | null | undefined): Promise<boolean> => {
    const normalized = email ? normalizeEmail(email) : null
    return normalized !== null && allowlist.contains(normalized)
  }
}

export function isUserAllowed(allowlist: AllowlistRepository) {
  return (userId: string): Promise<boolean> => allowlist.containsUser(userId)
}

export function seedAllowlist(allowlist: AllowlistRepository) {
  return async (entries: readonly string[]): Promise<SeedAllowlistResult> => {
    const { emails, invalidCount } = parseAllowlistEntries(entries)
    const added = emails.length > 0 ? await allowlist.addMissing(emails) : 0
    return { added, invalidCount }
  }
}

export function ensureSettings(settings: UserSettingsRepository) {
  return async (userId: string): Promise<void> => {
    await settings.getOrCreate(userId)
  }
}

export function getSettings(settings: UserSettingsRepository) {
  return async (userId: string): Promise<Settings> => toSettingsView(await settings.getOrCreate(userId))
}

export function updateSettings(settings: UserSettingsRepository) {
  // `input` is re-validated here so the rule holds for every adapter, not only HTTP.
  return async (userId: string, input: unknown): Promise<Settings> => {
    const parsed = updateSettingsRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new ValidationError('Invalid settings', parsed.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })))
    }
    return toSettingsView(await settings.update(userId, parsed.data))
  }
}
