import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { z } from 'zod';
import type { LlmProvider, ProviderErrorKind, ProviderRequest, ProviderResult, ProviderUsage } from '../application/ports';

// The only place that imports the OpenAI SDK (AGENTS.md architecture rules).

/** The slice of the SDK this adapter uses; tests substitute a stub. */
export interface ResponsesClient {
  responses: {
    create(body: ResponseCreateParamsNonStreaming, options: { timeout: number; maxRetries: number }): PromiseLike<unknown>;
  };
}

// Provider responses are external input: validated with Zod (AGENTS.md).
// Unknown keys are stripped; only what the adapter needs is described.
const usageSchema = z.object({
  input_tokens: z.int().nonnegative(),
  input_tokens_details: z.object({ cached_tokens: z.int().nonnegative().nullish() }).nullish(),
  output_tokens: z.int().nonnegative(),
  output_tokens_details: z.object({ reasoning_tokens: z.int().nonnegative().nullish() }).nullish(),
});

const responseSchema = z.object({
  status: z.string().nullish(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).nullish(),
  })),
  usage: usageSchema.nullish(),
});

function toUsage(usage: z.infer<typeof usageSchema> | null | undefined): ProviderUsage | null {
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

/** Maps SDK errors to normalized kinds. Order matters: subclasses first. */
export function classifyProviderError(error: unknown): { kind: ProviderErrorKind; httpStatus: number | null } {
  const httpStatus = error instanceof APIError && typeof error.status === 'number' ? error.status : null;
  if (error instanceof APIConnectionTimeoutError) return { kind: 'timeout', httpStatus };
  if (error instanceof APIConnectionError) return { kind: 'network', httpStatus };
  if (error instanceof RateLimitError) {
    return { kind: error.code === 'insufficient_quota' ? 'insufficient_quota' : 'rate_limited', httpStatus };
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) return { kind: 'auth', httpStatus };
  if (error instanceof BadRequestError || error instanceof NotFoundError
    || error instanceof UnprocessableEntityError || error instanceof ConflictError) {
    return { kind: 'bad_request', httpStatus };
  }
  if (error instanceof InternalServerError || (httpStatus !== null && httpStatus >= 500)) return { kind: 'server', httpStatus };
  return { kind: 'unknown', httpStatus };
}

/**
 * Uses `responses.create` with a strict JSON schema format and validates the
 * output itself, instead of `responses.parse`: `parse` throws on invalid
 * output, which would lose the usage report for a call that was billed.
 */
export function createOpenAiProviderWithClient(client: ResponsesClient, now: () => number = () => performance.now()): LlmProvider {
  return {
    id: 'openai',
    async complete<T>(request: ProviderRequest<T>): Promise<ProviderResult<T>> {
      const started = now();
      const latency = () => Math.max(0, Math.round(now() - started));

      let raw: unknown;
      try {
        raw = await client.responses.create({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          max_output_tokens: request.maxOutputTokens,
          store: false,
          text: { format: zodTextFormat(request.schema, request.schemaName) },
        }, { timeout: request.timeoutMs, maxRetries: 0 });
      }
      catch (error) {
        const { kind, httpStatus } = classifyProviderError(error);
        // No usage is reported for a thrown error; callers charge their estimate.
        return { kind: 'error', error: kind, usage: null, latencyMs: latency(), httpStatus };
      }

      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) return { kind: 'error', error: 'unknown', usage: null, latencyMs: latency(), httpStatus: null };
      const response = parsed.data;
      const usage = toUsage(response.usage);

      if (response.status === 'incomplete') return { kind: 'error', error: 'incomplete', usage, latencyMs: latency(), httpStatus: null };
      if (response.status && response.status !== 'completed') {
        return { kind: 'error', error: 'unknown', usage, latencyMs: latency(), httpStatus: null };
      }

      const contents = response.output.filter(item => item.type === 'message').flatMap(item => item.content ?? []);
      if (contents.some(content => content.type === 'refusal')) return { kind: 'refusal', usage, latencyMs: latency() };

      const text = contents.find(content => content.type === 'output_text')?.text;
      if (text === undefined) return { kind: 'error', error: 'invalid_output', usage, latencyMs: latency(), httpStatus: null };

      let json: unknown;
      try {
        json = JSON.parse(text);
      }
      catch {
        return { kind: 'error', error: 'invalid_output', usage, latencyMs: latency(), httpStatus: null };
      }
      const output = request.schema.safeParse(json);
      if (!output.success) return { kind: 'error', error: 'invalid_output', usage, latencyMs: latency(), httpStatus: null };
      return { kind: 'ok', output: output.data, usage, latencyMs: latency() };
    },
  };
}

/**
 * The OpenAI provider. The SDK's own retries are disabled: retry policy
 * belongs to the gateway (ARCHITECTURE.md 9.3), and in Phase 3 there is none.
 * For the composition root and the evaluation harness only; application code
 * reaches the provider through the gateway.
 */
export function createOpenAiProvider(options: Readonly<{ apiKey: string }>): LlmProvider {
  const client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
  return createOpenAiProviderWithClient({
    responses: { create: (body, requestOptions) => client.responses.create(body, requestOptions) },
  });
}
