import type { ZodType } from 'zod';

/** Provider-reported usage. `outputTokens` includes `reasoningTokens`. */
export type ProviderUsage = Readonly<{
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}>;

export type ProviderRequest<T> = Readonly<{
  model: string;
  instructions: string;
  /** Delimited JSON data built by the prompt; never concatenated into instructions. */
  input: string;
  schema: ZodType<T>;
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs: number;
}>;

/**
 * Normalized failure kinds. Raw provider messages are never passed on
 * (AGENTS.md "Validation and errors").
 * - `network`: the request may or may not have reached the provider.
 * - `incomplete`: e.g. `max_output_tokens` reached (often by reasoning); billed.
 * - `invalid_output`: no parseable output matching the schema; billed.
 */
export type ProviderErrorKind
  = | 'timeout'
    | 'rate_limited'
    | 'insufficient_quota'
    | 'auth'
    | 'bad_request'
    | 'server'
    | 'network'
    | 'incomplete'
    | 'invalid_output'
    | 'unknown';

/** `usage: null` means the provider reported none; callers charge their estimate and treat accounting as uncertain. */
export type ProviderResult<T>
  = | Readonly<{ kind: 'ok'; output: T; usage: ProviderUsage | null; latencyMs: number }>
    | Readonly<{ kind: 'refusal'; usage: ProviderUsage | null; latencyMs: number }>
    | Readonly<{ kind: 'error'; error: ProviderErrorKind; usage: ProviderUsage | null; latencyMs: number; httpStatus: number | null }>;

export interface LlmProvider {
  readonly id: string;
  /** Never throws for provider failures and never retries; returns a typed result. */
  complete<T>(request: ProviderRequest<T>): Promise<ProviderResult<T>>;
}
