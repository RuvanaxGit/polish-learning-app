import { describe, expect, it } from 'vitest'
import { checkMutationRequest, isGuardedRequest } from './request-guard'
import type { MutationRequest } from './request-guard'

const trusted = (origin: string) => origin === 'https://slowko.example'

const valid: MutationRequest = {
  method: 'PATCH',
  path: '/api/settings',
  origin: 'https://slowko.example',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  hasBody: true,
}

describe('isGuardedRequest', () => {
  it.each([
    ['POST', '/api/settings', true],
    ['patch', '/api/settings?x=1', true],
    ['DELETE', '/api/vocabulary/1', true],
    ['PUT', '/api/vocabulary/1/translation', true],
    ['GET', '/api/me', false],
    ['HEAD', '/api/me', false],
    ['OPTIONS', '/api/settings', false],
    ['POST', '/api/auth/sign-out', false],
    ['POST', '/api/auth', false],
    ['POST', '/api/authx', true],
    ['POST', '/api/auth/../settings', true],
    ['POST', '/login', false],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(isGuardedRequest(method, path)).toBe(expected)
  })
})

describe('checkMutationRequest', () => {
  it('allows a same-origin JSON request', () => {
    expect(checkMutationRequest(valid, trusted)).toEqual({ allowed: true })
    expect(checkMutationRequest({ ...valid, contentType: 'application/json; charset=utf-8' }, trusted)).toEqual({ allowed: true })
    // Older browsers and some clients omit Fetch Metadata; Origin is still required.
    expect(checkMutationRequest({ ...valid, secFetchSite: null }, trusted)).toEqual({ allowed: true })
  })

  it.each<[string, Partial<MutationRequest>, string]>([
    ['missing Origin', { origin: null }, 'origin_missing'],
    ['empty Origin', { origin: '' }, 'origin_missing'],
    ['opaque Origin', { origin: 'null' }, 'origin_untrusted'],
    ['foreign Origin', { origin: 'https://evil.example' }, 'origin_untrusted'],
    ['look-alike Origin', { origin: 'https://slowko.example.evil.example' }, 'origin_untrusted'],
    ['cross-site fetch metadata', { secFetchSite: 'cross-site' }, 'cross_site'],
    ['form content type', { contentType: 'application/x-www-form-urlencoded' }, 'not_json'],
    ['multipart content type', { contentType: 'multipart/form-data; boundary=x' }, 'not_json'],
    ['text/plain content type', { contentType: 'text/plain' }, 'not_json'],
    ['missing content type', { contentType: null }, 'not_json'],
    ['json-like content type', { contentType: 'application/jsonp' }, 'not_json'],
  ])('rejects %s', (_label, change, reason) => {
    expect(checkMutationRequest({ ...valid, ...change }, trusted)).toEqual({ allowed: false, reason })
  })

  it('requires JSON for DELETE only when it has a body', () => {
    expect(checkMutationRequest({ ...valid, method: 'DELETE', contentType: null, hasBody: false }, trusted)).toEqual({ allowed: true })
    expect(checkMutationRequest({ ...valid, method: 'DELETE', contentType: 'text/plain', hasBody: true }, trusted))
      .toEqual({ allowed: false, reason: 'not_json' })
    expect(checkMutationRequest({ ...valid, method: 'DELETE', origin: null, hasBody: false }, trusted))
      .toEqual({ allowed: false, reason: 'origin_missing' })
  })

  it('does not inspect requests it does not guard', () => {
    expect(checkMutationRequest({ ...valid, method: 'GET', origin: null }, trusted)).toEqual({ allowed: true })
    expect(checkMutationRequest({ ...valid, path: '/api/auth/sign-out', origin: null }, trusted)).toEqual({ allowed: true })
  })
})
