import { sql } from 'drizzle-orm'
import { check, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

// Owned by the identity module (ARCHITECTURE.md sections 4 and 7.2).

export const allowedEmails = pgTable('allowed_emails', {
  email: text().primaryKey(),
  note: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => [
  check('allowed_emails_email_normalized', sql`${table.email} = lower(btrim(${table.email})) AND length(${table.email}) BETWEEN 3 AND 254`),
])

// Per-user LLM limit overrides (ARCHITECTURE 7.2) are added with the LLM phase.
export const userSettings = pgTable('user_settings', {
  userId: uuid().primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  uiLocale: text().notNull().default('en'),
  translationLanguage: text().notNull().default('ru'),
  // IANA name reported by the browser; null until reported (treated as Europe/Warsaw).
  timezone: text(),
  dailyNewLimit: integer().notNull().default(20),
  desiredRetention: numeric({ precision: 3, scale: 2, mode: 'number' }).notNull().default(0.9),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => [
  check('user_settings_ui_locale', sql`${table.uiLocale} IN ('en')`),
  check('user_settings_translation_language', sql`${table.translationLanguage} IN ('ru', 'en', 'uk')`),
  check('user_settings_timezone', sql`${table.timezone} IS NULL OR length(${table.timezone}) BETWEEN 1 AND 64`),
  check('user_settings_daily_new_limit', sql`${table.dailyNewLimit} BETWEEN 0 AND 200`),
  check('user_settings_desired_retention', sql`${table.desiredRetention} BETWEEN 0.70 AND 0.97`),
])
