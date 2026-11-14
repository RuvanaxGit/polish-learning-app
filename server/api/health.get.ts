import type { HealthResponse } from '#shared/contracts/health';

// Unauthenticated liveness/readiness probe. Returns only up/down, never error details.
export default defineEventHandler(async (event): Promise<HealthResponse> => {
  const { database } = await useContainer().checkDatabaseHealth();

  setResponseHeader(event, 'Cache-Control', 'no-store');
  if (database === 'down') {
    setResponseStatus(event, 503);
    return { status: 'error', database };
  }
  return { status: 'ok', database };
});
