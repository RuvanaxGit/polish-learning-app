import { meResponseSchema } from '#shared/contracts/me';
import type { MeResponse } from '#shared/contracts/me';
import type { Settings } from '#shared/contracts/settings';

/**
 * The signed-in user and their settings, shared across the app. `null` means
 * signed out. Loaded by the auth route middleware before any page renders.
 */
export function useCurrentUser() {
  const me = useState<MeResponse | null>('current-user', () => null);
  const loaded = useState<boolean>('current-user-loaded', () => false);

  async function load(): Promise<MeResponse | null> {
    me.value = await fetchMe();
    loaded.value = true;
    return me.value;
  }

  function setSettings(settings: Settings): void {
    if (me.value) me.value = { ...me.value, settings };
  }

  function clear(): void {
    me.value = null;
    loaded.value = true;
  }

  return { me, loaded, load, setSettings, clear };
}

async function fetchMe(): Promise<MeResponse | null> {
  if (import.meta.server) {
    // During SSR, forward the browser's cookie to /api/me and pass any refreshed
    // session cookie back to the browser (ARCHITECTURE.md section 8.6).
    const event = useRequestEvent();
    const response = await $fetch.raw('/api/me', { headers: useRequestHeaders(['cookie']), ignoreResponseError: true });
    if (event) {
      for (const cookie of response.headers.getSetCookie()) appendResponseHeader(event, 'set-cookie', cookie);
    }
    return response.status === 200 ? meResponseSchema.parse(response._data) : null;
  }

  try {
    return meResponseSchema.parse(await $fetch('/api/me'));
  }
  catch (error) {
    if (fetchErrorDetails(error)?.statusCode === 401) return null;
    throw error;
  }
}
