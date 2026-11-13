import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NOT_INVITED_ERROR_CODE } from '../../server/core/auth/constants'
import { createContainer } from '../../server/core/container'
import type { Container } from '../../server/core/container'
import { account, session, user } from '../../server/core/db/schema/auth'
import { allowedEmails, userSettings } from '../../server/core/db/schema/identity'
import { getSession, signInWithGoogle, signOut } from '../support/auth-flow'
import { installFakeGoogle } from '../support/fake-google'
import type { FakeGoogle, GoogleProfile } from '../support/fake-google'
import { resetDatabase } from '../support/reset-database'
import { createTestConfig } from '../support/test-config'

// D-28 / Phase 2 requirement 1: Better Auth must work end to end with IDs that
// PostgreSQL generates with uuidv7(). Version nibble 7 proves the database made
// them: Better Auth's own generator produces 32-char random strings, and
// gen_random_uuid() produces version 4.
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let container: Container
let google: FakeGoogle

const alice: GoogleProfile = { sub: 'google-sub-alice', email: 'Alice@Example.com', emailVerified: true, name: 'Alice' }

beforeAll(() => {
  container = createContainer(createTestConfig())
})

afterAll(async () => {
  await container.dispose()
})

beforeEach(async () => {
  await resetDatabase(container.db)
  google = installFakeGoogle()
})

afterEach(() => {
  google.restore()
})

async function invite(email: string) {
  await container.identity.seedAllowlist([email])
}

describe('Better Auth with database-generated UUIDv7 IDs', () => {
  it('creates user, account, session, and settings on an invited first sign-in', async () => {
    await invite('alice@example.com')

    const { location, jar } = await signInWithGoogle(container.auth, google, alice)

    expect(location).toBe('/')
    const current = await getSession(container.auth, jar)
    expect(current?.user.email).toBe('alice@example.com')
    expect(current?.user.id).toMatch(UUID_V7)
    expect(current?.session.id).toMatch(UUID_V7)

    const users = await container.db.select().from(user)
    const accounts = await container.db.select().from(account)
    const sessions = await container.db.select().from(session)
    expect(users).toHaveLength(1)
    expect(accounts).toHaveLength(1)
    expect(sessions).toHaveLength(1)
    expect(users[0]?.id).toMatch(UUID_V7)
    expect(accounts[0]?.id).toMatch(UUID_V7)
    expect(accounts[0]).toMatchObject({ userId: users[0]?.id, providerId: 'google', accountId: alice.sub })
    // OAuth tokens are encrypted at rest (account.encryptOAuthTokens).
    expect(accounts[0]?.accessToken).toBeTruthy()
    expect(accounts[0]?.accessToken).not.toContain('google-access-token')
    expect(sessions[0]).toMatchObject({ userId: users[0]?.id, id: current?.session.id })

    const [settings] = await container.db.select().from(userSettings).where(eq(userSettings.userId, users[0]?.id ?? ''))
    expect(settings).toMatchObject({ translationLanguage: 'ru', uiLocale: 'en', dailyNewLimit: 20, desiredRetention: 0.9, timezone: null })
  })

  it('reuses the user and account for a returning user and keeps sessions independent', async () => {
    await invite('alice@example.com')
    const laptop = await signInWithGoogle(container.auth, google, alice)
    const phone = await signInWithGoogle(container.auth, google, alice)

    expect(await container.db.select().from(user)).toHaveLength(1)
    expect(await container.db.select().from(account)).toHaveLength(1)
    expect(await container.db.select().from(session)).toHaveLength(2)

    const laptopSession = await getSession(container.auth, laptop.jar)
    const phoneSession = await getSession(container.auth, phone.jar)
    expect(laptopSession?.user.id).toBe(phoneSession?.user.id)
    expect(laptopSession?.session.id).not.toBe(phoneSession?.session.id)

    const response = await signOut(container.auth, laptop.jar)
    expect(response.status).toBe(200)
    expect(await getSession(container.auth, laptop.jar)).toBeNull()
    expect((await getSession(container.auth, phone.jar))?.session.id).toBe(phoneSession?.session.id)
    expect(await container.db.select().from(session)).toHaveLength(1)
  })

  it('rejects an uninvited user without writing a user row', async () => {
    const { location, jar } = await signInWithGoogle(container.auth, google, alice)

    expect(location).toMatch(/^\/login\?/)
    expect(new URL(location, 'http://x').searchParams.get('error')?.toUpperCase()).toBe(NOT_INVITED_ERROR_CODE)
    expect(await getSession(container.auth, jar)).toBeNull()
    expect(await container.db.select().from(user)).toHaveLength(0)
    expect(await container.db.select().from(account)).toHaveLength(0)
  })

  it('rejects an invited address whose email Google has not verified', async () => {
    await invite('alice@example.com')
    const { location } = await signInWithGoogle(container.auth, google, { ...alice, emailVerified: false })

    expect(location).toMatch(/^\/login\?/)
    expect(await container.db.select().from(user)).toHaveLength(0)
  })

  it('refuses a returning user removed from the allowlist; their sessions end when the operator deletes them', async () => {
    await invite('alice@example.com')
    const earlier = await signInWithGoogle(container.auth, google, alice)
    await container.db.delete(allowedEmails).where(eq(allowedEmails.email, 'alice@example.com'))

    const attempt = await signInWithGoogle(container.auth, google, alice)
    expect(new URL(attempt.location, 'http://x').searchParams.get('error')?.toUpperCase()).toBe(NOT_INVITED_ERROR_CODE)
    expect(await getSession(container.auth, attempt.jar)).toBeNull()
    expect(await container.db.select().from(session)).toHaveLength(1)

    // Documented tradeoff (ARCHITECTURE 8.4): existing sessions stay valid until
    // the operator revokes them, which docs/operations.sql does.
    const before = await getSession(container.auth, earlier.jar)
    expect(before).not.toBeNull()
    await container.db.delete(session).where(eq(session.userId, before?.user.id ?? ''))
    expect(await getSession(container.auth, earlier.jar)).toBeNull()
  })

  it('does not link a different Google account that uses the same email', async () => {
    await invite('alice@example.com')
    await signInWithGoogle(container.auth, google, alice)

    const impostor = await signInWithGoogle(container.auth, google, { ...alice, sub: 'google-sub-other' })

    expect(impostor.location).toMatch(/^\/login\?/)
    expect(await getSession(container.auth, impostor.jar)).toBeNull()
    expect(await container.db.select().from(account)).toHaveLength(1)
  })

  it('cascades a user deletion to sessions, accounts, and settings', async () => {
    await invite('alice@example.com')
    const { jar } = await signInWithGoogle(container.auth, google, alice)
    const current = await getSession(container.auth, jar)

    await container.db.delete(user).where(eq(user.id, current?.user.id ?? ''))

    expect(await container.db.select().from(session)).toHaveLength(0)
    expect(await container.db.select().from(account)).toHaveLength(0)
    expect(await container.db.select().from(userSettings)).toHaveLength(0)
    expect(await getSession(container.auth, jar)).toBeNull()
  })

  it('keeps Better Auth\'s origin check on under NODE_ENV=test', async () => {
    expect(process.env.NODE_ENV).toBe('test')
    await invite('alice@example.com')
    const { jar } = await signInWithGoogle(container.auth, google, alice)

    for (const origin of ['https://evil.example', null]) {
      const headers = jar.headers({ 'content-type': 'application/json' })
      if (origin) headers.set('origin', origin)
      const response = await container.auth.handler(new Request('http://localhost:3000/api/auth/sign-out', { method: 'POST', headers, body: '{}' }))
      expect(response.status).toBe(403)
    }
    expect(await getSession(container.auth, jar)).not.toBeNull()
  })

  it('declares exactly the fields Better Auth expects for each table', async () => {
    const context = await container.auth.$context
    const ours = { user, session, account, verification: (await import('../../server/core/db/schema/auth')).verification }
    for (const [model, table] of Object.entries(context.tables)) {
      const drizzleTable = ours[model as keyof typeof ours]
      expect(drizzleTable, `missing table for ${model}`).toBeDefined()
      for (const field of Object.keys(table.fields)) {
        expect(Object.keys(drizzleTable), `${model}.${field}`).toContain(field)
      }
    }
  })
})
