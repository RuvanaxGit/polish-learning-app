import type { APIRequestContext } from '@playwright/test'

export const E2E_SESSION_ROUTE = '/api/__e2e__/session'

export type SeededUser = Readonly<{ userId: string, email: string }>

/**
 * Creates a brand-new invited user with a session through the test-only route
 * (present only in the e2e build). The session cookie lands in `request`'s
 * cookie store; for `page.request` that is the browser context's store.
 */
export async function signInAsNewUser(request: APIRequestContext, baseURL: string): Promise<SeededUser> {
  const response = await request.post(E2E_SESSION_ROUTE, { headers: { origin: baseURL }, data: {} })
  if (response.status() !== 201) throw new Error(`E2E session route returned ${response.status()}`)
  return await response.json() as SeededUser
}
