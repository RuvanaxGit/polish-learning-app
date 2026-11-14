import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

export type GoogleProfile = Readonly<{
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}>;

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function readFormBody(input: RequestInfo | URL, init: RequestInit | undefined): Promise<URLSearchParams> {
  if (input instanceof Request) return new URLSearchParams(await input.text());
  const body = init?.body;
  if (typeof body === 'string') return new URLSearchParams(body);
  if (body instanceof URLSearchParams) return body;
  return new URLSearchParams();
}

/**
 * Replaces the network for Google's token endpoint. Better Auth exchanges the
 * authorization code there and decodes the returned id_token (in this flow the
 * token comes straight from Google over TLS, so it isn't signature-checked).
 * Any other outgoing request fails the test, so nothing leaves the machine.
 */
export function installFakeGoogle() {
  const profilesByCode = new Map<string, GoogleProfile>();

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (!url.startsWith(GOOGLE_TOKEN_ENDPOINT)) {
      throw new Error(`Unexpected network request in test: ${url}`);
    }
    const code = (await readFormBody(input, init)).get('code') ?? '';
    const profile = profilesByCode.get(code);
    profilesByCode.delete(code); // authorization codes are single-use
    if (!profile) return Response.json({ error: 'invalid_grant' }, { status: 400 });

    const now = Math.floor(Date.now() / 1000);
    const idToken = [
      base64url({ alg: 'RS256', typ: 'JWT', kid: 'test' }),
      base64url({
        iss: 'https://accounts.google.com',
        aud: 'test-google-client-id',
        sub: profile.sub,
        email: profile.email,
        email_verified: profile.emailVerified,
        name: profile.name,
        iat: now,
        exp: now + 3600,
      }),
      'test-signature',
    ].join('.');

    return Response.json({
      access_token: `google-access-token-${code}`,
      id_token: idToken,
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid email profile',
    });
  });

  return {
    /** Registers a one-time authorization code that "Google" exchanges for `profile`. */
    issueCode(profile: GoogleProfile): string {
      const code = randomUUID();
      profilesByCode.set(code, profile);
      return code;
    },
    restore: () => spy.mockRestore(),
  };
}

export type FakeGoogle = ReturnType<typeof installFakeGoogle>;
