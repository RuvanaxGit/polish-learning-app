import type { ApiError } from '../../shared/contracts/errors';
import { DomainError, NotFoundError, ValidationError } from '../core/shared/errors';

/** An HTTP-level failure raised by the Nitro layer itself (auth, body parsing). */
export class HttpFailure extends Error {
  override readonly name = 'HttpFailure';

  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export type ApiErrorResponse = Readonly<{ status: number; body: ApiError }>;

/**
 * The single mapping from errors to HTTP responses (AGENTS.md "Validation and
 * errors"). Unknown errors become a generic 500: no stack traces, no provider
 * or database messages reach the client.
 */
export function toApiErrorResponse(error: unknown): ApiErrorResponse {
  if (error instanceof HttpFailure) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof ValidationError) {
    return { status: 400, body: { error: { code: error.code, message: error.message, issues: [...error.issues] } } };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: { code: error.code, message: 'Not found' } } };
  }
  if (error instanceof DomainError) {
    return { status: 400, body: { error: { code: error.code, message: error.message } } };
  }
  return { status: 500, body: { error: { code: 'internal_error', message: 'Something went wrong' } } };
}
