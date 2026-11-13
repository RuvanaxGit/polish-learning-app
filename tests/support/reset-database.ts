import { sql } from 'drizzle-orm'
import type { Database } from '../../server/core/db/client'
import { requireTestDatabaseUrl } from './test-database'

/** Empties all tables between tests. Only ever runs against the *_test database. */
export async function resetDatabase(db: Database): Promise<void> {
  requireTestDatabaseUrl()
  await db.execute(sql`TRUNCATE TABLE "user", "verification", "allowed_emails" RESTART IDENTITY CASCADE`)
}
