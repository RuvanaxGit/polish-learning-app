import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { E2E_SESSION_ROUTE, signInAsNewUser } from './support/session';

// HTTP-level checks for our endpoints and the CSRF middleware (ARCHITECTURE 8.8).
// Runs in the desktop project only (see playwright.config.ts).

let api: APIRequestContext;
let origin: string;

test.beforeEach(async ({ playwright, baseURL }) => {
  origin = baseURL ?? '';
  api = await playwright.request.newContext({ baseURL });
});

test.afterEach(async () => {
  await api.dispose();
});

const json = (extra: Record<string, string> = {}) => ({ 'content-type': 'application/json', ...extra });

async function currentSettings() {
  return (await (await api.get('/api/me')).json()).settings;
}

test.describe('authentication required', () => {
  test('GET /api/me and PATCH /api/settings return 401 without a session', async () => {
    expect((await api.get('/api/me')).status()).toBe(401);
    const patch = await api.patch('/api/settings', { headers: json({ origin }), data: { dailyNewLimit: 10 } });
    expect(patch.status()).toBe(401);
    expect(await patch.json()).toEqual({ error: { code: 'unauthenticated', message: 'Authentication required' } });
  });

  test('the session cookie is HttpOnly and SameSite=Lax', async () => {
    const response = await api.post(E2E_SESSION_ROUTE, { headers: json({ origin }), data: {} });
    const setCookie = response.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie').map(header => header.value);
    const session = setCookie.find(value => value.includes('session_token='));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });
});

test.describe('GET /api/me and PATCH /api/settings', () => {
  test.beforeEach(async () => {
    await signInAsNewUser(api, origin);
  });

  test('returns the current user and default settings', async () => {
    const response = await api.get('/api/me');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('private, no-store');
    const body = await response.json();
    expect(body.user.email).toMatch(/@e2e\.invalid$/);
    expect(body.settings).toEqual({
      uiLocale: 'en', translationLanguage: 'ru', timezone: null, effectiveTimezone: 'Europe/Warsaw', dailyNewLimit: 20, desiredRetention: 0.9,
    });
  });

  test('updates settings (happy path)', async () => {
    const response = await api.patch('/api/settings', { headers: json({ origin }), data: { dailyNewLimit: 35, desiredRetention: 0.85 } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ dailyNewLimit: 35, desiredRetention: 0.85 });
  });

  test('rejects invalid input with 400 and issue paths', async () => {
    const outOfRange = await api.patch('/api/settings', { headers: json({ origin }), data: { dailyNewLimit: 500 } });
    expect(outOfRange.status()).toBe(400);
    expect((await outOfRange.json()).error.issues.map((issue: { path: string }) => issue.path)).toEqual(['dailyNewLimit']);

    const unknownKey = await api.patch('/api/settings', { headers: json({ origin }), data: { userId: 'someone-else' } });
    expect(unknownKey.status()).toBe(400);

    // A Buffer is sent as-is; a string would be re-encoded as a valid JSON string.
    const brokenJson = await api.patch('/api/settings', { headers: json({ origin }), data: Buffer.from('{"dailyNewLimit":') });
    expect(brokenJson.status()).toBe(400);
    expect((await brokenJson.json()).error.code).toBe('invalid_json');

    expect(await currentSettings()).toMatchObject({ dailyNewLimit: 20 });
  });

  test('only ever changes the caller\'s own settings', async ({ playwright, baseURL }) => {
    const other = await playwright.request.newContext({ baseURL });
    await signInAsNewUser(other, origin);
    await other.patch('/api/settings', { headers: json({ origin }), data: { translationLanguage: 'uk' } });

    expect(await currentSettings()).toMatchObject({ translationLanguage: 'ru' });
    await other.dispose();
  });
});

test.describe('CSRF origin check', () => {
  test.beforeEach(async () => {
    await signInAsNewUser(api, origin);
  });

  const rejected: Array<[string, Record<string, string>]> = [
    ['no Origin header', json()],
    ['a foreign Origin', json({ origin: 'https://evil.example' })],
    ['a look-alike Origin', json({ origin: 'http://127.0.0.1:3100.evil.example' })],
    ['Sec-Fetch-Site: cross-site', json({ 'origin': 'http://127.0.0.1:3100', 'sec-fetch-site': 'cross-site' })],
  ];
  for (const [label, headers] of rejected) {
    test(`rejects a mutation with ${label}`, async () => {
      const response = await api.patch('/api/settings', { headers, data: { dailyNewLimit: 99 } });
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: { code: 'forbidden', message: 'Forbidden' } });
      expect(await currentSettings()).toMatchObject({ dailyNewLimit: 20 });
    });
  }

  for (const contentType of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain']) {
    test(`rejects a mutation sent as ${contentType}`, async () => {
      const response = await api.fetch('/api/settings', {
        method: 'PATCH',
        headers: { origin, 'content-type': contentType },
        data: 'dailyNewLimit=99',
      });
      expect(response.status()).toBe(403);
      expect(await currentSettings()).toMatchObject({ dailyNewLimit: 20 });
    });
  }

  test('Better Auth applies its own origin check to its routes', async () => {
    const signOut = await api.post('/api/auth/sign-out', { headers: json({ origin: 'https://evil.example' }), data: {} });
    expect(signOut.status()).toBe(403);
    expect((await api.get('/api/me')).status()).toBe(200);
  });
});

test.describe('E2E session route', () => {
  test('cannot target an existing user: it accepts no input', async ({ playwright, baseURL }) => {
    const victim = await signInAsNewUser(api, origin);
    const attacker = await playwright.request.newContext({ baseURL });

    for (const data of [{ email: victim.email }, { userId: victim.userId }]) {
      const response = await attacker.post(E2E_SESSION_ROUTE, { headers: json({ origin }), data });
      expect(response.status()).toBe(400);
    }
    expect((await attacker.get('/api/me')).status()).toBe(401);

    const fresh = await signInAsNewUser(attacker, origin);
    expect(fresh.userId).not.toBe(victim.userId);
    expect(fresh.email).not.toBe(victim.email);
    await attacker.dispose();
  });

  test('is protected by the CSRF check like every other mutation', async () => {
    const response = await api.post(E2E_SESSION_ROUTE, { headers: json(), data: {} });
    expect(response.status()).toBe(403);
  });
});

test('unknown /api paths answer with a JSON 404', async () => {
  const response = await api.get('/api/does-not-exist', { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
});
