/**
 * Error code in `/login?error=...` when the allowlist rejects a sign-in.
 * Better Auth forwards the code of the APIError thrown by our hooks.
 */
export const NOT_INVITED_ERROR_CODE = 'NOT_INVITED';
