import type { ModelPrice } from '../domain/accounting';

// Published OpenAI prices in USD per 1M tokens, as recorded in DECISIONS.md
// OD-03. VERIFY against https://developers.openai.com/api/docs/pricing before
// any live call, and update this table (with the date) when prices change.
// `cachedInputUsdPerMTok: null` = not recorded: cached input is then charged at
// the full input price, which can only overestimate.
// A model that is not listed has no price, and every caller fails closed.
const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'gpt-6-luna': { inputUsdPerMTok: 0.10, cachedInputUsdPerMTok: null, outputUsdPerMTok: 0.50 },
  'gpt-6.1-terra': { inputUsdPerMTok: 1, cachedInputUsdPerMTok: null, outputUsdPerMTok: 5 },
  'gpt-6.1-sol': { inputUsdPerMTok: 2, cachedInputUsdPerMTok: null, outputUsdPerMTok: 10 },
  'gpt-6-astra': { inputUsdPerMTok: 10, cachedInputUsdPerMTok: null, outputUsdPerMTok: 50 },
};

export class UnknownModelPriceError extends Error {
  override readonly name = 'UnknownModelPriceError';

  constructor(readonly model: string) {
    super(`No price recorded for model "${model}"`);
  }
}

export function pricedModels(): readonly string[] {
  return Object.keys(MODEL_PRICES);
}

/** Fails closed: throws for any model without a recorded price. */
export function priceForModel(model: string): ModelPrice {
  const price = Object.hasOwn(MODEL_PRICES, model) ? MODEL_PRICES[model] : undefined;
  if (!price) throw new UnknownModelPriceError(model);
  return price;
}
