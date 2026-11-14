import { sql } from 'drizzle-orm';
import type { Database } from './client';

export type DatabaseHealth = Readonly<{ database: 'up' | 'down' }>;

export function createDatabaseHealthCheck(db: Database): () => Promise<DatabaseHealth> {
  return async () => {
    try {
      await db.execute(sql`select 1`);
      return { database: 'up' };
    }
    catch {
      // The cause is deliberately dropped: connection errors can include host
      // names and user names, and the health endpoint is unauthenticated.
      return { database: 'down' };
    }
  };
}
