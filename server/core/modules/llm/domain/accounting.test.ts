import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { costMicroUsd, estimatedCostMicroUsd, estimateRequest, usdToMicroUsd } from './accounting';
import type { ModelPrice } from './accounting';

const price: ModelPrice = { inputUsdPerMTok: 1, cachedInputUsdPerMTok: 0.25, outputUsdPerMTok: 5 };

describe('costMicroUsd', () => {
  it('prices uncached input, cached input, and output separately', () => {
    // 1,000 uncached × 1 + 1,000 cached × 0.25 + 500 output × 5 micro-USD
    expect(costMicroUsd({ inputTokens: 2000, cachedInputTokens: 1000, outputTokens: 500 }, price)).toBe(1000 + 250 + 2500);
  });

  it('rounds up to whole micro-USD', () => {
    const cheap: ModelPrice = { inputUsdPerMTok: 0.1, cachedInputUsdPerMTok: null, outputUsdPerMTok: 0.5 };
    expect(costMicroUsd({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 }, cheap)).toBe(1);
    expect(costMicroUsd({ inputTokens: 15, cachedInputTokens: 0, outputTokens: 1 }, cheap)).toBe(2); // 1.5 + 0.5
  });

  it('charges cached input at the full input price when the cached price is unknown (fail-closed)', () => {
    const unknownCached: ModelPrice = { ...price, cachedInputUsdPerMTok: null };
    expect(costMicroUsd({ inputTokens: 1000, cachedInputTokens: 1000, outputTokens: 0 }, unknownCached)).toBe(1000);
  });

  it('never counts more cached tokens than input tokens', () => {
    expect(costMicroUsd({ inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 }, price)).toBe(25);
  });

  it('rejects invalid token counts and prices', () => {
    expect(() => costMicroUsd({ inputTokens: -1, cachedInputTokens: 0, outputTokens: 0 }, price)).toThrow(RangeError);
    expect(() => costMicroUsd({ inputTokens: 1.5, cachedInputTokens: 0, outputTokens: 0 }, price)).toThrow(RangeError);
    expect(() => costMicroUsd({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 }, { ...price, inputUsdPerMTok: 0.0001 })).toThrow(RangeError);
    expect(() => costMicroUsd({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 }, { ...price, outputUsdPerMTok: Number.NaN })).toThrow(RangeError);
  });
});

describe('estimateRequest', () => {
  const schema = z.object({ answer: z.string() });

  it('bounds input at 2 characters per token, including the JSON schema, plus overhead', () => {
    const estimate = estimateRequest({ instructions: 'x'.repeat(1000), input: 'y'.repeat(100), schema, maxOutputTokens: 700 });
    const schemaLength = JSON.stringify(z.toJSONSchema(schema)).length;
    expect(estimate).toEqual({ inputTokens: Math.ceil((1100 + schemaLength) / 2) + 64, maxOutputTokens: 700 });
  });

  it('counts code points, so Polish and Cyrillic text is not underestimated', () => {
    const latin = estimateRequest({ instructions: '', input: 'a'.repeat(200), schema, maxOutputTokens: 0 });
    const polish = estimateRequest({ instructions: '', input: 'ż'.repeat(200), schema, maxOutputTokens: 0 });
    expect(polish.inputTokens).toBe(latin.inputTokens);
  });

  it('prices the estimate as all-uncached input plus maximum output', () => {
    const estimate = { inputTokens: 1000, maxOutputTokens: 1000 };
    expect(estimatedCostMicroUsd(estimate, price)).toBe(1000 + 5000);
  });

  it('is an upper bound of the actual cost for the same request', () => {
    const estimate = { inputTokens: 1200, maxOutputTokens: 1500 };
    const actual = costMicroUsd({ inputTokens: 900, cachedInputTokens: 300, outputTokens: 1500 }, price);
    expect(actual).toBeLessThanOrEqual(estimatedCostMicroUsd(estimate, price));
  });
});

describe('usdToMicroUsd', () => {
  it('converts dollars to integer micro-dollars', () => {
    expect(usdToMicroUsd(3)).toBe(3_000_000);
    expect(usdToMicroUsd(0.25)).toBe(250_000);
    expect(() => usdToMicroUsd(-1)).toThrow(RangeError);
  });
});
