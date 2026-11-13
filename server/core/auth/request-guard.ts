import { AUTH_BASE_PATH } from './constants'

// CSRF guard for our own mutating /api routes (ARCHITECTURE.md section 8.8).
// Framework-independent so a future backend can reuse it as a hook.

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export type MutationRequest = Readonly<{
  method: string
  /** Request path, possibly with a query string. */
  path: string
  origin: string | null
  secFetchSite: string | null
  contentType: string | null
  /** Whether the request declares a body (content-length > 0 or transfer-encoding). */
  hasBody: boolean
}>

export type GuardDecision
  = | Readonly<{ allowed: true }>
    | Readonly<{ allowed: false, reason: 'origin_missing' | 'origin_untrusted' | 'cross_site' | 'not_json' }>

function normalizedPathname(path: string): string {
  // Resolves dot segments, so `/api/auth/../settings` is checked as `/api/settings`.
  return new URL(path, 'http://guard.invalid').pathname
}

export function isGuardedRequest(method: string, path: string): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false
  const pathname = normalizedPathname(path)
  if (!pathname.startsWith('/api/')) return false
  // Better Auth applies its own origin, Fetch Metadata, and state checks to its routes.
  return pathname !== AUTH_BASE_PATH && !pathname.startsWith(`${AUTH_BASE_PATH}/`)
}

function isJson(contentType: string | null): boolean {
  if (contentType === null) return false
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/json'
}

export function checkMutationRequest(
  request: MutationRequest,
  isTrustedOrigin: (origin: string) => boolean,
): GuardDecision {
  if (!isGuardedRequest(request.method, request.path)) return { allowed: true }

  if (request.origin === null || request.origin === '') return { allowed: false, reason: 'origin_missing' }
  if (!isTrustedOrigin(request.origin)) return { allowed: false, reason: 'origin_untrusted' }
  if (request.secFetchSite?.toLowerCase() === 'cross-site') return { allowed: false, reason: 'cross_site' }

  // Form posts (the classic CSRF vector) can't send application/json. A body-less
  // DELETE has no content type, and a cross-site form can't send DELETE.
  const bodyRequired = request.method.toUpperCase() !== 'DELETE' || request.hasBody
  if (bodyRequired && !isJson(request.contentType)) return { allowed: false, reason: 'not_json' }

  return { allowed: true }
}
