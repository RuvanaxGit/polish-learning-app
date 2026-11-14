import type { Auth } from '../../server/core/auth/create-auth';
import type { FakeGoogle, GoogleProfile } from './fake-google';
import { TEST_BASE_URL } from './test-config';

/** Minimal cookie jar: enough to carry Better Auth's state and session cookies. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = value === '' || attributes.some(attribute => /^\s*max-age=0\s*$/i.test(attribute));
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  headers(extra: Record<string, string> = {}): Headers {
    const headers = new Headers(extra);
    const cookie = this.header();
    if (cookie !== '') headers.set('cookie', cookie);
    return headers;
  }
}

export type SignInResult = Readonly<{ location: string; jar: CookieJar }>;

/**
 * Drives Better Auth's real Google OAuth flow through auth.handler:
 * POST /sign-in/social -> (consent at "Google") -> GET /callback/google.
 */
export async function signInWithGoogle(auth: Auth, google: FakeGoogle, profile: GoogleProfile, jar = new CookieJar()): Promise<SignInResult> {
  const start = await auth.handler(new Request(`${TEST_BASE_URL}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: jar.headers({ 'content-type': 'application/json', 'origin': TEST_BASE_URL }),
    body: JSON.stringify({ provider: 'google', callbackURL: '/', errorCallbackURL: '/login' }),
  }));
  if (start.status !== 200) throw new Error(`sign-in/social returned ${start.status}`);
  jar.absorb(start);
  const { url } = await start.json() as { url: string };
  const state = new URL(url).searchParams.get('state');
  if (!state) throw new Error('Google authorization URL has no state');

  const code = google.issueCode(profile);
  const callback = await auth.handler(new Request(
    `${TEST_BASE_URL}/api/auth/callback/google?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    { headers: jar.headers() },
  ));
  jar.absorb(callback);
  return { location: callback.headers.get('location') ?? '', jar };
}

export async function getSession(auth: Auth, jar: CookieJar) {
  return auth.api.getSession({ headers: jar.headers() });
}

export async function signOut(auth: Auth, jar: CookieJar): Promise<Response> {
  const response = await auth.handler(new Request(`${TEST_BASE_URL}/api/auth/sign-out`, {
    method: 'POST',
    headers: jar.headers({ 'content-type': 'application/json', 'origin': TEST_BASE_URL }),
    body: '{}',
  }));
  jar.absorb(response);
  return response;
}
