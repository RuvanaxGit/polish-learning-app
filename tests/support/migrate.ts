import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const migrationsFolder = resolve(import.meta.dirname, '../../drizzle');

/** Applies all committed migrations in drizzle/ to the given database. */
export async function migrateDatabase(url: string): Promise<void> {
  if (!existsSync(resolve(migrationsFolder, 'meta/_journal.json'))) {
    // No migrations generated yet (Phase 1 has no tables).
    return;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  }
  finally {
    await pool.end();
  }
}
