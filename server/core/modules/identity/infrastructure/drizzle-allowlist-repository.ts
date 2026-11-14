import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../../db/client';
import { user } from '../../../db/schema/auth';
import { allowedEmails } from '../../../db/schema/identity';
import type { AllowlistRepository } from '../application/ports';

export function createDrizzleAllowlistRepository(db: Database): AllowlistRepository {
  return {
    async contains(email) {
      const rows = await db.select({ email: allowedEmails.email }).from(allowedEmails).where(eq(allowedEmails.email, email)).limit(1);
      return rows.length > 0;
    },
    // Reads the auth-owned "user" table; identity never writes it (ARCHITECTURE section 4).
    async containsUser(userId) {
      const rows = await db.select({ email: allowedEmails.email })
        .from(user)
        .innerJoin(allowedEmails, eq(allowedEmails.email, sql`lower(${user.email})`))
        .where(eq(user.id, userId))
        .limit(1);
      return rows.length > 0;
    },
    async addMissing(emails) {
      const inserted = await db.insert(allowedEmails)
        .values(emails.map(email => ({ email })))
        .onConflictDoNothing()
        .returning({ email: allowedEmails.email });
      return inserted.length;
    },
  };
}
