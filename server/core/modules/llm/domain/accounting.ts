import { z } from 'zod';
import type { ZodType } from 'zod';

/** Published prices in USD per 1M tokens. `cachedInputUsdPerMTok: null` = unknown. */
export type ModelPrice = Readonly<{
  inputUsdPerMTok: number;
  cachedInputUsdPerMTok: number | null;
  outputUsdPerMTok: number;
}>;

/** Provider-reported token counts. Output includes reasoning tokens. */
export type TokenUsage = Readonly<{
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}>;

export type RequestEstimate = Readonly<{
  inputTokens: number;
  maxOutputTokens: number;
}>;

// Pessimistic heuristic, NOT a guaranteed bound: English prose averages ~4
// characters per token and Polish ~3, so 2 usually overestimates. The JSON
// schema of the structured output is billed as input too, so it is included.
const CHARACTERS_PER_TOKEN_ASSUMED = 2;
const REQUEST_OVERHEAD_TOKENS = 64;

function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Pre-call token estimate (ARCHITECTURE.md 9.2.1). The output part is a hard
 * provider limit (`max_output_tokens`, which includes reasoning). The input part
 * is a HEURISTIC, not an upper bound: unusual text can tokenize at fewer than 2
 * characters per token, and the provider may count framing or schema tokens we
 * can't see. Callers must compare actual usage with the estimate afterwards.
 */
export function estimateRequest(parts: Readonly<{
  instructions: string;
  input: string;
  schema: ZodType;
  maxOutputTokens: number;
}>): RequestEstimate {
  const schemaJson = JSON.stringify(z.toJSONSchema(parts.schema));
  const characters = codePointLength(parts.instructions) + codePointLength(parts.input) + codePointLength(schemaJson);
  return {
    inputTokens: Math.ceil(characters / CHARACTERS_PER_TOKEN_ASSUMED) + REQUEST_OVERHEAD_TOKENS,
    maxOutputTokens: parts.maxOutputTokens,
  };
}

/** USD per 1M tokens equals micro-USD per token; ×1000 gives integer nano-USD per token. */
function nanoUsdPerToken(usdPerMTok: number): number {
  const nano = Math.round(usdPerMTok * 1000);
  if (!Number.isFinite(usdPerMTok) || usdPerMTok < 0 || Math.abs(nano - usdPerMTok * 1000) > 1e-6) {
    throw new RangeError('Model price must be a non-negative USD amount with at most 3 decimals per 1M tokens');
  }
  return nano;
}

function assertTokenCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Token counts must be non-negative integers');
}

/**
 * Cost in integer micro-USD, rounded up. Cached input is priced at the cached
 * rate when known, otherwise at the full input rate (fail-closed: never cheaper
 * than the real price).
 */
export function costMicroUsd(usage: TokenUsage, price: ModelPrice): number {
  assertTokenCount(usage.inputTokens);
  assertTokenCount(usage.cachedInputTokens);
  assertTokenCount(usage.outputTokens);
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const uncached = usage.inputTokens - cached;
  const nano = uncached * nanoUsdPerToken(price.inputUsdPerMTok)
    + cached * nanoUsdPerToken(price.cachedInputUsdPerMTok ?? price.inputUsdPerMTok)
    + usage.outputTokens * nanoUsdPerToken(price.outputUsdPerMTok);
  return Math.ceil(nano / 1000);
}

/** Estimated cost: all input uncached, output at the limit. Only as reliable as the input estimate. */
export function estimatedCostMicroUsd(estimate: RequestEstimate, price: ModelPrice): number {
  return costMicroUsd({ inputTokens: estimate.inputTokens, cachedInputTokens: 0, outputTokens: estimate.maxOutputTokens }, price);
}

export function usdToMicroUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new RangeError('USD amount must be non-negative');
  return Math.round(usd * 1_000_000);
}
