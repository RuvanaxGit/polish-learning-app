import type { H3Event } from 'h3'
import { HttpFailure } from './api-error-mapping'

export type AuthenticatedUser = Readonly<{
  userId: string
  name: string
  email: string
  image: string | null
}>

/**
 * Resolves the session from the request cookie (ARCHITECTURE.md section 8.6).
 * Throws 401 without a valid session. Forwards any refreshed session cookie,
 * because Better Auth slides the expiry on server-side lookups too.
 */
export async function requireUser(event: H3Event): Promise<AuthenticatedUser> {
  const { auth } = useContainer()
  const { headers, response } = await auth.api.getSession({ headers: event.headers, returnHeaders: true })

  for (const cookie of headers.getSetCookie()) {
    appendResponseHeader(event, 'set-cookie', cookie)
  }
  if (!response) throw new HttpFailure(401, 'unauthenticated', 'Authentication required')

  return {
    userId: response.user.id,
    name: response.user.name,
    email: response.user.email,
    image: response.user.image ?? null,
  }
}
