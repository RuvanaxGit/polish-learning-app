import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../../server/core/container';
import type { Container } from '../../server/core/container';
import { user } from '../../server/core/db/schema/auth';
import { allowedEmails, userSettings } from '../../server/core/db/schema/identity';
import { ValidationError } from '../../server/core/shared/errors';
import { resetDatabase } from '../support/reset-database';
import { createTestConfig } from '../support/test-config';

let container: Container;

beforeAll(() => {
  container = createContainer(createTestConfig());
});

afterAll(async () => {
  await container.dispose();
});

beforeEach(async () => {
  await resetDatabase(container.db);
});

async function createUser(email: string): Promise<string> {
  const [row] = await container.db.insert(user).values({ name: 'Test', email, emailVerified: true }).returning({ id: user.id });
  if (!row) throw new Error('insert failed');
  return row.id;
}

describe('allowlist', () => {
  it('seeds normalized emails insert-only and ignores invalid entries', async () => {
    const first = await container.identity.seedAllowlist([' Alice@Example.COM ', 'bob@example.com', 'not-an-email', 'alice@example.com']);
    expect(first).toEqual({ added: 2, invalidCount: 1 });

    const second = await container.identity.seedAllowlist(['bob@example.com']);
    expect(second).toEqual({ added: 0, invalidCount: 0 });

    const rows = await container.db.select({ email: allowedEmails.email }).from(allowedEmails).orderBy(allowedEmails.email);
    expect(rows.map(row => row.email)).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('matches emails case-insensitively and checks users by their stored email', async () => {
    await container.identity.seedAllowlist(['alice@example.com']);
    const aliceId = await createUser('Alice@example.com');
    const malloryId = await createUser('mallory@example.com');

    expect(await container.identity.isEmailAllowed('ALICE@example.com')).toBe(true);
    expect(await container.identity.isEmailAllowed('mallory@example.com')).toBe(false);
    expect(await container.identity.isEmailAllowed(null)).toBe(false);
    expect(await container.identity.isUserAllowed(aliceId)).toBe(true);
    expect(await container.identity.isUserAllowed(malloryId)).toBe(false);
  });

  it('rejects non-normalized emails at the database level', async () => {
    await expect(container.db.insert(allowedEmails).values({ email: 'Alice@example.com' })).rejects.toThrow();
    await expect(container.db.insert(allowedEmails).values({ email: ' alice@example.com' })).rejects.toThrow();
  });
});

describe('user settings', () => {
  it('creates defaults once, even under concurrent first reads', async () => {
    const userId = await createUser('alice@example.com');

    const results = await Promise.all(Array.from({ length: 5 }, () => container.identity.getSettings(userId)));

    expect(new Set(results.map(result => JSON.stringify(result))).size).toBe(1);
    expect(results[0]).toEqual({
      uiLocale: 'en',
      translationLanguage: 'ru',
      timezone: null,
      effectiveTimezone: 'Europe/Warsaw',
      dailyNewLimit: 20,
      desiredRetention: 0.9,
    });
    expect(await container.db.select().from(userSettings)).toHaveLength(1);
  });

  it('updates only the given user and only the given fields', async () => {
    const aliceId = await createUser('alice@example.com');
    const bobId = await createUser('bob@example.com');
    await container.identity.getSettings(bobId);

    const updated = await container.identity.updateSettings(aliceId, { translationLanguage: 'uk', desiredRetention: 0.85, timezone: 'America/New_York' });

    expect(updated).toMatchObject({ translationLanguage: 'uk', desiredRetention: 0.85, timezone: 'America/New_York', effectiveTimezone: 'America/New_York', dailyNewLimit: 20 });
    expect(await container.identity.getSettings(bobId)).toMatchObject({ translationLanguage: 'ru', desiredRetention: 0.9, timezone: null });
  });

  it.each([
    [{ dailyNewLimit: 201 }],
    [{ dailyNewLimit: -1 }],
    [{ dailyNewLimit: 1.5 }],
    [{ desiredRetention: 0.69 }],
    [{ desiredRetention: 0.98 }],
    [{ desiredRetention: 0.905 }],
    [{ translationLanguage: 'de' }],
    [{ uiLocale: 'ru' }],
    [{ timezone: 'Mars/Olympus_Mons' }],
    [{}],
    [{ dailyNewLimit: 10, userId: 'someone-else' }],
  ])('rejects invalid input %j before touching the database', async (input) => {
    const userId = await createUser('alice@example.com');
    await expect(container.identity.updateSettings(userId, input)).rejects.toBeInstanceOf(ValidationError);
  });

  it('enforces the same ranges with CHECK constraints', async () => {
    const userId = await createUser('alice@example.com');
    await container.identity.getSettings(userId);
    const update = (column: string, value: number | string) =>
      container.db.execute(sql`UPDATE user_settings SET ${sql.identifier(column)} = ${value} WHERE user_id = ${userId}`);

    await expect(update('daily_new_limit', 201)).rejects.toThrow();
    await expect(update('desired_retention', 0.98)).rejects.toThrow();
    await expect(update('translation_language', 'de')).rejects.toThrow();
    await expect(update('ui_locale', 'ru')).rejects.toThrow();
  });
});
