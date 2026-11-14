import type { ZodType } from 'zod';

export type LlmFeature = 'lookup' | 'short_translation' | 'details';
export type ModelTier = 'fast' | 'detail';
export type QuotaBucket = 'lookup' | 'details';

export type RefineResult<O>
  = | Readonly<{ ok: true; value: O; warnings: readonly string[] }>
    | Readonly<{ ok: false; reason: string; warnings: readonly string[] }>;

/**
 * A versioned prompt (ARCHITECTURE.md 9.6). Changing `instructions`, `schema`,
 * or `refine` requires a new `version`, because the version is part of the
 * cache key.
 *
 * `schema` is model-facing: object root, every property required (nullable
 * where absent), no transforms or refinements. Business rules and limits live
 * in `refine`, which runs after Zod validation and before anything is cached.
 */
export interface PromptDefinition<I, O> {
  readonly feature: LlmFeature;
  readonly version: string;
  readonly modelTier: ModelTier;
  readonly quotaBucket: QuotaBucket;
  /** Model-visible name of the structured output format. */
  readonly schemaName: string;
  readonly instructions: string;
  readonly schema: ZodType<O>;
  /** Includes reasoning tokens; also the output part of the cost estimate. */
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  /** User-derived values only ever travel as JSON data (AGENTS.md security rule 7). */
  toModelInput(input: I): string;
  refine(output: O, input: I): RefineResult<O>;
}
