import { z } from 'zod';
import type { TranslationLanguage } from '../../../../../shared/contracts/settings';
import type { PromptDefinition } from '../domain/prompt';
import { analysisCoreShape, LEMMA_RULES, POLISH_RULES, refineAnalyses, refineSuggestion } from './analysis';
import { cleanText, DATA_ONLY_RULE, LANGUAGE_NAMES } from './common';

// DRAFT until the live evaluation freezes it (Phase 3 step 3.2). Bump the
// version on any change to instructions, schema, or refine logic.
export const LOOKUP_PROMPT_VERSION = 'lookup-1-draft.1';
export const MAX_SHORT_TRANSLATION_LENGTH = 300;

export type LookupPromptInput = Readonly<{
  /** Normalized lookup key (`normalize(q).key`). */
  key: string;
  language: TranslationLanguage;
}>;

export const lookupOutputSchema = z.object({
  isPolish: z.boolean(),
  suggestion: z.string().nullable(),
  analyses: z.array(z.object({ ...analysisCoreShape, shortTranslation: z.string() })),
});

export type LookupOutput = z.infer<typeof lookupOutputSchema>;
export type LookupAnalysis = LookupOutput['analyses'][number];

const instructions = `You are a Polish morphology analyzer for a vocabulary app.
The user message is a JSON object: {"text": a Polish word, inflected form, or short expression; "translationLanguage": a language name}. ${DATA_ONLY_RULE}

Return every plausible analysis of the text, most likely first, at most 8.
${LEMMA_RULES}
- shortTranslation: a short translation of the lemma (not of the inflected form) into translationLanguage, at most about 8 words; list distinct main senses separated by ", ". Required for every analysis.

${POLISH_RULES}`;

/**
 * One call returns analyses (language-independent) and short translations in
 * the requested language (ARCHITECTURE.md 6.2). Every kept analysis carries a
 * valid translation, so a cold lookup never needs a second, paid
 * `short_translation` call in the same request.
 */
export const lookupPrompt: PromptDefinition<LookupPromptInput, LookupOutput> = {
  feature: 'lookup',
  version: LOOKUP_PROMPT_VERSION,
  modelTier: 'fast',
  quotaBucket: 'lookup',
  schemaName: 'polish_lookup',
  instructions,
  schema: lookupOutputSchema,
  maxOutputTokens: 1500,
  timeoutMs: 10_000,
  toModelInput: input => JSON.stringify({ text: input.key, translationLanguage: LANGUAGE_NAMES[input.language] }),
  refine(output, input) {
    const warnings: string[] = [];
    const suggestion = refineSuggestion(output.suggestion, input.key, warnings);
    if (!output.isPolish) {
      if (output.analyses.length > 0) warnings.push('analyses_ignored_not_polish');
      return { ok: true, value: { isPolish: false, suggestion, analyses: [] }, warnings };
    }
    const refined = refineAnalyses(output.analyses, input.key, (analysis, index, extraWarnings) => {
      const shortTranslation = cleanText(analysis.shortTranslation, MAX_SHORT_TRANSLATION_LENGTH);
      if (shortTranslation === null) {
        extraWarnings.push(`analysis_${index}_invalid_translation`);
        return null;
      }
      return { ...analysis, shortTranslation };
    });
    warnings.push(...refined.warnings);
    if (refined.droppedAll) return { ok: false, reason: 'all_analyses_invalid', warnings };
    return { ok: true, value: { isPolish: true, suggestion, analyses: refined.analyses }, warnings };
  },
};
