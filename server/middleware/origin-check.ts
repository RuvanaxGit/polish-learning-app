import { checkMutationRequest, isGuardedRequest } from '../core/auth/request-guard';

// CSRF protection for our own mutating /api routes (ARCHITECTURE.md section 8.8).
// Reads headers only, never the body, and skips /api/auth/* (Better Auth checks those).
export default defineEventHandler(async (event) => {
  if (!isGuardedRequest(event.method, event.path)) return;

  const context = await useContainer().auth.$context;
  const contentLength = Number(getRequestHeader(event, 'content-length') ?? '0');
  const decision = checkMutationRequest(
    {
      method: event.method,
      path: event.path,
      origin: getRequestHeader(event, 'origin') ?? null,
      secFetchSite: getRequestHeader(event, 'sec-fetch-site') ?? null,
      contentType: getRequestHeader(event, 'content-type') ?? null,
      hasBody: contentLength > 0 || getRequestHeader(event, 'transfer-encoding') !== undefined,
    },
    origin => context.isTrustedOrigin(origin, { allowRelativePaths: false }),
  );

  if (!decision.allowed) {
    setResponseStatus(event, 403);
    return { error: { code: 'forbidden', message: 'Forbidden' } };
  }
});
