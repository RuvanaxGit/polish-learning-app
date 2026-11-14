import type { EventHandlerRequest, H3Event } from 'h3';
import type { ApiError } from '../../shared/contracts/errors';
import { HttpFailure, toApiErrorResponse } from './api-error-mapping';

const MAX_JSON_BODY_BYTES = 16 * 1024;

/**
 * Wraps an /api handler so every failure goes through toApiErrorResponse.
 * Unexpected errors are logged by name only (AGENTS.md security rule 5).
 */
export function defineApiHandler<T>(handler: (event: H3Event<EventHandlerRequest>) => Promise<T>) {
  return defineEventHandler(async (event): Promise<T | ApiError> => {
    try {
      return await handler(event);
    }
    catch (error) {
      const { status, body } = toApiErrorResponse(error);
      if (status >= 500) {
        console.error(`[api] ${event.method} ${event.path.split('?', 1)[0]} failed: ${error instanceof Error ? error.name : typeof error}`);
      }
      setResponseStatus(event, status);
      return body;
    }
  });
}

/** Reads a JSON body with a size limit. Validation is the caller's job. */
export async function readJsonBody(event: H3Event): Promise<unknown> {
  const declaredLength = Number(getRequestHeader(event, 'content-length') ?? '0');
  if (declaredLength > MAX_JSON_BODY_BYTES) throw new HttpFailure(413, 'payload_too_large', 'Request body too large');

  const raw = await readRawBody(event, 'utf8');
  if (raw === undefined || raw === '') throw new HttpFailure(400, 'invalid_json', 'Request body must be JSON');
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BODY_BYTES) throw new HttpFailure(413, 'payload_too_large', 'Request body too large');
  try {
    return JSON.parse(raw) as unknown;
  }
  catch {
    throw new HttpFailure(400, 'invalid_json', 'Request body must be JSON');
  }
}
