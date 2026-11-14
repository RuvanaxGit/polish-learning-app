import { migrateDatabase } from '../support/migrate';
import { requireTestDatabaseUrl } from '../support/test-database';

// Vitest calls the named `setup` export once before the integration project runs.
export async function setup(): Promise<void> {
  await migrateDatabase(requireTestDatabaseUrl());
}
