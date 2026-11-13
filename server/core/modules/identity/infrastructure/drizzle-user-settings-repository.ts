import { eq, sql } from 'drizzle-orm'
import type { Database } from '../../../db/client'
import { userSettings } from '../../../db/schema/identity'
import type { UserSettingsRepository } from '../application/ports'
import type { UserSettings } from '../domain/settings'

type Row = typeof userSettings.$inferSelect

function toDomain(row: Row): UserSettings {
  // The CHECK constraints guarantee these values; narrowing here keeps the
  // domain type exact instead of plain `string`.
  if (row.uiLocale !== 'en') throw new Error(`Unexpected ui_locale in user_settings`)
  if (row.translationLanguage !== 'ru' && row.translationLanguage !== 'en' && row.translationLanguage !== 'uk') {
    throw new Error(`Unexpected translation_language in user_settings`)
  }
  return {
    userId: row.userId,
    uiLocale: row.uiLocale,
    translationLanguage: row.translationLanguage,
    timezone: row.timezone,
    dailyNewLimit: row.dailyNewLimit,
    desiredRetention: row.desiredRetention,
  }
}

export function createDrizzleUserSettingsRepository(db: Database): UserSettingsRepository {
  // Insert-then-select instead of select-then-insert, so concurrent first
  // requests can't race (ARCHITECTURE.md section 7 conventions).
  async function getOrCreate(userId: string): Promise<UserSettings> {
    await db.insert(userSettings).values({ userId }).onConflictDoNothing()
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
    if (!row) throw new Error('user_settings row missing after insert')
    return toDomain(row)
  }

  return {
    getOrCreate,
    async update(userId, changes) {
      await getOrCreate(userId)
      const [row] = await db.update(userSettings)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(userSettings.userId, userId))
        .returning()
      if (!row) throw new Error('user_settings row missing during update')
      return toDomain(row)
    },
  }
}
