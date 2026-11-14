import { createAuthClient } from 'better-auth/vue';

type AuthClient = ReturnType<typeof createAuthClient>;
let client: AuthClient | undefined;

// Browser-only: sign-in redirects to Google and sign-out posts with the
// browser's cookie and Origin, which Better Auth checks.
function authClient(): AuthClient {
  if (import.meta.server) throw new Error('The auth client is browser-only');
  client ??= createAuthClient({ basePath: '/api/auth' });
  return client;
}

export function useAuth() {
  const { clear } = useCurrentUser();

  async function signInWithGoogle(): Promise<void> {
    await authClient().signIn.social({ provider: 'google', callbackURL: '/', errorCallbackURL: '/login' });
  }

  async function signOut(): Promise<void> {
    await authClient().signOut();
    clear();
    await navigateTo('/login', { replace: true });
  }

  return { signInWithGoogle, signOut };
}
