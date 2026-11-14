import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../core/shared/errors';
import { HttpFailure, toApiErrorResponse } from './api-error-mapping';

describe('toApiErrorResponse', () => {
  it('maps HTTP failures as given', () => {
    expect(toApiErrorResponse(new HttpFailure(401, 'unauthenticated', 'Authentication required'))).toEqual({
      status: 401,
      body: { error: { code: 'unauthenticated', message: 'Authentication required' } },
    });
  });

  it('maps validation errors to 400 with issues', () => {
    const error = new ValidationError('Invalid settings', [{ path: 'dailyNewLimit', message: 'Too big' }]);
    expect(toApiErrorResponse(error)).toEqual({
      status: 400,
      body: { error: { code: 'validation_failed', message: 'Invalid settings', issues: [{ path: 'dailyNewLimit', message: 'Too big' }] } },
    });
  });

  it('maps not-found errors to 404 without the internal message', () => {
    expect(toApiErrorResponse(new NotFoundError('vocabulary item 123 of user 456'))).toEqual({
      status: 404,
      body: { error: { code: 'not_found', message: 'Not found' } },
    });
  });

  it('hides everything about unexpected errors', () => {
    const response = toApiErrorResponse(new Error('connect ECONNREFUSED 10.0.0.5:5432 user=slowko'));
    expect(response).toEqual({ status: 500, body: { error: { code: 'internal_error', message: 'Something went wrong' } } });
    expect(toApiErrorResponse('a string').status).toBe(500);
  });
});
