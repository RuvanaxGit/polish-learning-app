// Public API of the identity module (ARCHITECTURE.md section 4).
import type { Database } from '../../db/client'
import { ensureSettings, getSettings, isEmailAllowed, isUserAllowed, seedAllowlist, updateSettings } from './application/use-cases'
import { createDrizzleAllowlistRepository } from './infrastructure/drizzle-allowlist-repository'
import { createDrizzleUserSettingsRepository } from './infrastructure/drizzle-user-settings-repository'

export type { SeedAllowlistResult } from './application/use-cases'
export { normalizeEmail } from './domain/email'

export type IdentityModule = ReturnType<typeof createIdentityModule>

export function createIdentityModule(db: Database) {
  const allowlist = createDrizzleAllowlistRepository(db)
  const settings = createDrizzleUserSettingsRepository(db)
  return {
    isEmailAllowed: isEmailAllowed(allowlist),
    isUserAllowed: isUserAllowed(allowlist),
    seedAllowlist: seedAllowlist(allowlist),
    ensureSettings: ensureSettings(settings),
    getSettings: getSettings(settings),
    updateSettings: updateSettings(settings),
  }
}
