/** Narrows errors thrown by $fetch without importing ofetch (a transitive dependency). */
export function fetchErrorDetails(error: unknown): { statusCode: number | undefined; data: unknown } | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  const statusCode = typeof error.statusCode === 'number' ? error.statusCode : undefined;
  const data = 'data' in error ? error.data : undefined;
  return { statusCode, data };
}
