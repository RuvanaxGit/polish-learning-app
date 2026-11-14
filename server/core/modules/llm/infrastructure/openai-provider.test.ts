import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { ProviderRequest } from '../application/ports';
import { detailsPrompt } from '../prompts/details.v1';
import { lookupAnalysisOnlyPrompt } from '../prompts/lookup-analysis-only.v1';
import { lookupPrompt } from '../prompts/lookup.v1';
import { shortTranslationPrompt } from '../prompts/short-translation.v1';
import { classifyProviderError, createOpenAiProviderWithClient } from './openai-provider';
import type { ResponsesClient } from './openai-provider';

// No network: the SDK client is replaced by a stub. The SDK error classes are
// real, so the mapping is tested against what the SDK actually throws.

const schema = z.object({ answer: z.string() });
const request: ProviderRequest<{ answer: string }> = {
  model: 'test-model',
  instructions: 'Answer.',
  input: '{"text":"psa"}',
  schema,
  schemaName: 'answer',
  maxOutputTokens: 100,
  timeoutMs: 1000,
};

const usage = {
  input_tokens: 120,
  input_tokens_details: { cached_tokens: 20 },
  output_tokens: 40,
  output_tokens_details: { reasoning_tokens: 10 },
};

function message(text: string) {
  return { type: 'message', content: [{ type: 'output_text', text }] };
}

function stub(result: unknown | (() => never)) {
  const calls: { body: unknown; options: unknown }[] = [];
  const client: ResponsesClient = {
    responses: {
      create: async (body, options) => {
        calls.push({ body, options });
        if (typeof result === 'function') return (result as () => never)();
        return result;
      },
    },
  };
  return { provider: createOpenAiProviderWithClient(client, () => 0), calls };
}

describe('openai provider adapter', () => {
  it('sends a strict structured-output request without SDK retries and with storage off', async () => {
    const { provider, calls } = stub({ status: 'completed', output: [message('{"answer":"ok"}')], usage });
    await provider.complete(request);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toEqual({ timeout: 1000, maxRetries: 0 });
    expect(calls[0]?.body).toMatchObject({
      model: 'test-model',
      instructions: 'Answer.',
      input: '{"text":"psa"}',
      max_output_tokens: 100,
      store: false,
      text: { format: { type: 'json_schema', name: 'answer', strict: true } },
    });
  });

  it('returns validated output and normalized usage', async () => {
    const { provider } = stub({ status: 'completed', output: [message('{"answer":"ok"}')], usage });
    expect(await provider.complete(request)).toEqual({
      kind: 'ok',
      output: { answer: 'ok' },
      usage: { inputTokens: 120, cachedInputTokens: 20, outputTokens: 40, reasoningTokens: 10 },
      latencyMs: 0,
    });
  });

  it('reports schema-invalid or unparseable output as invalid_output but keeps the billed usage', async () => {
    for (const text of ['{"answer":42}', 'not json']) {
      const { provider } = stub({ status: 'completed', output: [message(text)], usage });
      expect(await provider.complete(request)).toMatchObject({ kind: 'error', error: 'invalid_output', usage: { inputTokens: 120 } });
    }
  });

  it('reports incomplete responses (e.g. max_output_tokens reached) with usage', async () => {
    const { provider } = stub({ status: 'incomplete', output: [], usage });
    expect(await provider.complete(request)).toMatchObject({ kind: 'error', error: 'incomplete', usage: { outputTokens: 40 } });
  });

  it('reports refusals with usage and without the refusal text', async () => {
    const { provider } = stub({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }], usage });
    expect(await provider.complete(request)).toEqual({ kind: 'refusal', usage: expect.objectContaining({ inputTokens: 120 }), latencyMs: 0 });
  });

  it('reports usage as unknown (null) when the provider omits it', async () => {
    const { provider } = stub({ status: 'completed', output: [message('{"answer":"ok"}')] });
    expect(await provider.complete(request)).toMatchObject({ kind: 'ok', usage: null });
  });

  it('treats an unrecognizable response envelope as an unknown error with unknown usage', async () => {
    const { provider } = stub({ unexpected: true });
    expect(await provider.complete(request)).toMatchObject({ kind: 'error', error: 'unknown', usage: null });
  });

  it('turns thrown SDK errors into typed results with unknown usage', async () => {
    const { provider } = stub(() => {
      throw new APIConnectionTimeoutError();
    });
    expect(await provider.complete(request)).toMatchObject({ kind: 'error', error: 'timeout', usage: null, httpStatus: null });
  });
});

describe('classifyProviderError', () => {
  const headers = new Headers();

  it.each([
    [new APIConnectionTimeoutError(), 'timeout', null],
    [new APIConnectionError({ message: 'reset' }), 'network', null],
    [new RateLimitError(429, { code: 'insufficient_quota' }, 'quota', headers), 'insufficient_quota', 429],
    [new RateLimitError(429, { code: 'rate_limit_exceeded' }, 'slow down', headers), 'rate_limited', 429],
    [new AuthenticationError(401, undefined, 'bad key', headers), 'auth', 401],
    [new BadRequestError(400, undefined, 'bad', headers), 'bad_request', 400],
    [new InternalServerError(503, undefined, 'down', headers), 'server', 503],
    [new Error('other'), 'unknown', null],
    ['not an error', 'unknown', null],
  ])('maps %s', (error, kind, httpStatus) => {
    expect(classifyProviderError(error)).toEqual({ kind, httpStatus });
  });
});

// Offline compatibility check of every prompt schema with the SDK's strict
// Structured Outputs conversion (Zod 4). The live smoke test confirms the API side.
describe('structured output schema conversion', () => {
  const prompts = [lookupPrompt, lookupAnalysisOnlyPrompt, shortTranslationPrompt, detailsPrompt];

  type JsonSchema = { type?: unknown; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: unknown; items?: JsonSchema; anyOf?: JsonSchema[] };

  function assertStrict(node: JsonSchema, path: string): void {
    if (node.type === 'object' && node.properties) {
      expect(node.additionalProperties, `${path} additionalProperties`).toBe(false);
      expect([...(node.required ?? [])].sort(), `${path} required`).toEqual(Object.keys(node.properties).sort());
      for (const [key, child] of Object.entries(node.properties)) assertStrict(child, `${path}.${key}`);
    }
    if (node.items) assertStrict(node.items, `${path}[]`);
    for (const option of node.anyOf ?? []) assertStrict(option, path);
  }

  it.each(prompts.map(prompt => [prompt.schemaName, prompt] as const))('%s converts to a strict JSON schema', (_name, prompt) => {
    const format = zodTextFormat(prompt.schema, prompt.schemaName);
    expect(format).toMatchObject({ type: 'json_schema', strict: true, name: prompt.schemaName });
    assertStrict(format.schema as JsonSchema, prompt.schemaName);
  });
});
