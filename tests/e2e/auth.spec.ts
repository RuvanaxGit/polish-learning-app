import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signInAsNewUser } from './support/session';

async function expectNoHorizontalScroll(page: Page) {
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
}

test.describe('signed out', () => {
  test('any app page redirects to the login page', async ({ page }) => {
    for (const path of ['/', '/settings']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByTestId('sign-in-google')).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('shows the "not invited" message after an allowlist rejection', async ({ page }) => {
    await page.goto('/login?error=NOT_INVITED');
    await expect(page.getByTestId('login-error')).toContainText('not invited');

    await page.goto('/login?error=internal_server_error');
    await expect(page.getByTestId('login-error')).toContainText('Sign-in failed');
  });

  test('the Google button starts Better Auth\'s OAuth flow from the browser', async ({ page, baseURL }) => {
    // Never actually leave for Google: capture the authorization request instead.
    let authorizationUrl: URL | undefined;
    await page.route('https://accounts.google.com/**', async (route) => {
      authorizationUrl = new URL(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>google stub</p>' });
    });

    await page.goto('/login');
    await page.getByTestId('sign-in-google').click();
    await expect.poll(() => authorizationUrl?.hostname).toBe('accounts.google.com');

    expect(authorizationUrl?.searchParams.get('client_id')).toBe('e2e-google-client-id');
    expect(authorizationUrl?.searchParams.get('redirect_uri')).toBe(`${baseURL}/api/auth/callback/google`);
    expect(authorizationUrl?.searchParams.get('state')).toBeTruthy();
    expect(authorizationUrl?.searchParams.get('code_challenge')).toBeTruthy();
  });
});

test.describe('signed in', () => {
  test('lands on the dashboard and never on review; /login bounces back', async ({ page, baseURL }) => {
    await signInAsNewUser(page.request, baseURL ?? '');

    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByTestId('greeting')).toHaveText('Welcome, E2E User');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  test('server-renders the signed-in page with the session cookie (SSR)', async ({ page, baseURL }) => {
    await signInAsNewUser(page.request, baseURL ?? '');

    const response = await page.request.get('/', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Welcome, E2E User');
  });

  test('sign out revokes the session on the server', async ({ page, baseURL }) => {
    await signInAsNewUser(page.request, baseURL ?? '');
    await page.goto('/');
    const cookiesBefore = await page.context().cookies();

    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login$/);

    // Replaying the old cookie must not work: the session was deleted server-side.
    const replay = await page.request.get('/api/me', {
      headers: { cookie: cookiesBefore.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') },
    });
    expect(replay.status()).toBe(401);
  });
});
