// Typed domain errors. Use cases throw these; one mapper in server/utils turns
// them into HTTP responses (AGENTS.md "Validation and errors").

export type ErrorIssue = Readonly<{ path: string; message: string }>;

export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class ValidationError extends DomainError {
  override readonly name = 'ValidationError';
  readonly code = 'validation_failed';

  constructor(message: string, readonly issues: readonly ErrorIssue[] = []) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  override readonly name = 'NotFoundError';
  readonly code = 'not_found';
}
