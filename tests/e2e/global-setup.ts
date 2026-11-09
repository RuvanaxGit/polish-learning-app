import { migrateDatabase } from '../support/migrate'
import { requireTestDatabaseUrl } from '../support/test-database'

// Playwright requires a default export for global setup.
export default async function globalSetup(): Promise<void> {
  await migrateDatabase(requireTestDatabaseUrl())
}
