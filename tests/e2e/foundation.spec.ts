import { expect, test } from '@playwright/test'

test('the dashboard placeholder is the landing page', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(page.getByTestId('foundation-placeholder')).toBeVisible()
  await expect(page).toHaveTitle(/Słówko/)

  // Mobile-first requirement: no horizontal scrolling at the viewport width.
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflows).toBe(false)
})

test('the health endpoint reports the database as up', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(await response.json()).toEqual({ status: 'ok', database: 'up' })
})
