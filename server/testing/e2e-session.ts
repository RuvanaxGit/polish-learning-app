import { randomUUID } from 'node:crypto'
import { makeSignature } from 'better-auth/crypto'

// Test-only session seeding for Playwright (ARCHITECTURE.md section 13).
//
// Three independent safeguards (AGENTS.md security rule 9):
// 1. Build time: this file is outside Nitro's scanned directories and is only
//    registered by the `e2e` build environment (`nuxt build --envName e2e`,
//    see nuxt.config.ts). Production builds don't contain it at all; the build
//    safety test in tests/build/ verifies that.
// 2. Runtime: it answers 404 unless config.e2eAuthBypass is true, which
//    requires NODE_ENV=test and E2E_AUTH_BYPASS=true; startup fails if the flag
//    is set under any other NODE_ENV.
// 3. No impersonation: it accepts no input and always creates a brand-new user
//    with a random address under the reserved `.invalid` TLD, so it can never
//    produce a session for an existing user.
export const E2E_SESSION_ROUTE = '/api/__e2e__/session'
export const E2E_EMAIL_DOMAIN = 'e2e.invalid'

export default defineApiHandler(async (event) => {
  const { config, auth, identity } = useContainer()
  if (!config.e2eAuthBypass) throw new HttpFailure(404, 'not_found', 'Not found')

  const body = await readJsonBody(event)
  if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length > 0) {
    throw new HttpFailure(400, 'invalid_request', 'This endpoint accepts only an empty JSON object')
  }

  const email = `e2e-${randomUUID()}@${E2E_EMAIL_DOMAIN}`
  await identity.seedAllowlist([email])

  // Goes through Better Auth's internal adapter, so the same database hooks
  // run as for a real sign-in (allowlist checks, default settings).
  const context = await auth.$context
  const user = await context.internalAdapter.createUser(
    { email, name: 'E2E User', emailVerified: true },
    { method: 'e2e-test-seed' },
  )
  const session = await context.internalAdapter.createSession(user.id)

  const cookie = context.authCookies.sessionToken
  const signedToken = `${session.token}.${await makeSignature(session.token, context.secret)}`
  setCookie(event, cookie.name, signedToken, {
    path: cookie.attributes.path ?? '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: cookie.attributes.secure ?? false,
    maxAge: cookie.attributes.maxAge,
  })

  setResponseStatus(event, 201)
  return { userId: user.id, email }
})
