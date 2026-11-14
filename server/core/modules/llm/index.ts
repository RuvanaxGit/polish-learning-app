// Public API of the llm module (ARCHITECTURE.md section 4).
//
// Phase 3 step 3.1 (evaluation kit): prompts, accounting, the provider port and
// its OpenAI adapter, and the price table. The gateway (cache, quotas, usage
// ledger) arrives in step 3.5; until then nothing in the app calls a provider.

export type { LlmFeature, ModelTier, PromptDefinition, QuotaBucket, RefineResult } from './domain/prompt';
export type { ModelPrice, RequestEstimate, TokenUsage } from './domain/accounting';
export { costMicroUsd, estimatedCostMicroUsd, estimateRequest, usdToMicroUsd } from './domain/accounting';
export type { LlmProvider, ProviderErrorKind, ProviderRequest, ProviderResult, ProviderUsage } from './application/ports';

export { lookupPrompt, LOOKUP_PROMPT_VERSION } from './prompts/lookup.v1';
export type { LookupAnalysis, LookupOutput, LookupPromptInput } from './prompts/lookup.v1';
export { lookupAnalysisOnlyPrompt } from './prompts/lookup-analysis-only.v1';
export type { LookupAnalysisOnlyInput, LookupAnalysisOnlyOutput } from './prompts/lookup-analysis-only.v1';
export { shortTranslationPrompt } from './prompts/short-translation.v1';
export type { ShortTranslationInput, ShortTranslationLexeme, ShortTranslationOutput } from './prompts/short-translation.v1';
export { detailsPrompt } from './prompts/details.v1';
export type { DetailsOutput, DetailsPromptInput } from './prompts/details.v1';

export { priceForModel, pricedModels, UnknownModelPriceError } from './infrastructure/model-prices';
export { createOpenAiProvider } from './infrastructure/openai-provider';
