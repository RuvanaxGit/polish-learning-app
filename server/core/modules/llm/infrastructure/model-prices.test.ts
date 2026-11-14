import { describe, expect, it } from 'vitest';
import { costMicroUsd } from '../domain/accounting';
import { priceForModel, pricedModels, UnknownModelPriceError } from './model-prices';

describe('model prices', () => {
  it('fails closed for models without a recorded price', () => {
    expect(() => priceForModel('gpt-unknown')).toThrow(UnknownModelPriceError);
    // Object prototype keys are not prices.
    expect(() => priceForModel('constructor')).toThrow(UnknownModelPriceError);
  });

  it('records only prices the accounting can represent exactly', () => {
    for (const model of pricedModels()) {
      const price = priceForModel(model);
      expect(() => costMicroUsd({ inputTokens: 1, cachedInputTokens: 1, outputTokens: 1 }, price)).not.toThrow();
    }
  });
});
