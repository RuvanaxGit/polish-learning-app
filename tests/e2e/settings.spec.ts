import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signInAsNewUser } from './support/session';

test.use({ timezoneId: 'America/New_York' });

// The save button is disabled until the page has hydrated (useHydrated), so
// typing into server-rendered inputs before then can't be lost.
async function waitForHydration(page: Page) {
  await expect(page.getByTestId('save-settings')).toBeEnabled();
}

test.beforeEach(async ({ page, baseURL }) => {
  await signInAsNewUser(page.request, baseURL ?? '');
});

test('reports the browser time zone on first load', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await (await page.request.get('/api/me')).json()).settings.timezone).toBe('America/New_York');
});

test('changes the translation language and keeps it after a reload', async ({ page }) => {
  await page.goto('/settings');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByTestId('translation-language-note')).toContainText('does not change words you have already saved');

  await page.getByTestId('translation-language').click();
  await page.getByRole('option', { name: 'Ukrainian' }).click();
  await page.getByTestId('save-settings').click();
  // The toast text also appears in an aria-live region.
  await expect(page.getByText('Settings saved').first()).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('translation-language')).toContainText('Ukrainian');
  expect((await (await page.request.get('/api/me')).json()).settings.translationLanguage).toBe('uk');

  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});

test('rejects an out-of-range new-card limit with a validation message', async ({ page }) => {
  await page.goto('/settings');
  await waitForHydration(page);
  const input = page.getByLabel('New cards per day');
  await input.fill('250');
  await input.blur();
  await page.getByTestId('save-settings').click();

  await expect(page.getByTestId('settings-form')).toContainText(/less than or equal to 200|<=200|too big/i);
  expect((await (await page.request.get('/api/me')).json()).settings.dailyNewLimit).toBe(20);
});
