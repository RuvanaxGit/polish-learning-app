import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index';

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseClient = Readonly<{
  db: Database;
  close: () => Promise<void>;
}>;

export function createDatabaseClient(options: { url: string; poolMax: number }): DatabaseClient {
  const pool = new Pool({
    connectionString: options.url,
    max: options.poolMax,
    // Fail fast instead of hanging requests when the database is unreachable.
    connectionTimeoutMillis: 5_000,
  });
  // Without a listener, an idle client error (e.g. the database restarting)
  // is an unhandled 'error' event and crashes the process.
  // Only the error code is logged; messages can contain connection details.
  pool.on('error', (error) => {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
    console.error(`[db] idle client error (code: ${code})`);
  });

  return {
    // Must match `casing` in drizzle.config.ts: camelCase properties, snake_case columns.
    db: drizzle({ client: pool, schema, casing: 'snake_case' }),
    close: () => pool.end(),
  };
}
