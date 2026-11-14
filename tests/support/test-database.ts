/**
 * Returns TEST_DATABASE_URL after checking it cannot point at a real database.
 * Integration and E2E tests write to (and later truncate) this database.
 */
export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. See .env.example and README.md.');
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  }
  catch {
    throw new Error('TEST_DATABASE_URL is not a valid URL.');
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must point to a database whose name ends with "_test".');
  }
  if (process.env.DATABASE_URL === url) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  }
  return url;
}
