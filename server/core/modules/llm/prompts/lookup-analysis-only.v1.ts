import { z } from 'zod';
import type { PromptDefinition } from '../domain/prompt';
import { analysisCoreShape, LEMMA_RULES, POLISH_RULES, refineAnalyses, refineSuggestion } from './analysis';
import { DATA_ONLY_RULE } from './common';

// EVALUATION ONLY: the "split" variant (analysis without translations) that
// the live evaluation compares against the combined lookup prompt
// (Phase 3 plan R2-1). Not wired into the app; promoted only by an owner decision.
export const LOOKUP_ANALYSIS_ONLY_PROMPT_VERSION = 'lookup-analysis-only-1-draft.1';

export type LookupAnalysisOnlyInput = Readonly<{ key: string }>;

export const lookupAnalysisOnlyOutputSchema = z.object({
  isPolish: z.boolean(),
  suggestion: z.string().nullable(),
  analyses: z.array(z.object(analysisCoreShape)),
});

export type LookupAnalysisOnlyOutput = z.infer<typeof lookupAnalysisOnlyOutputSchema>;

const instructions = `You are a Polish morphology analyzer for a vocabulary app.
The user message is a JSON object: {"text": a Polish word, inflected form, or short expression}. ${DATA_ONLY_RULE}

Return every plausible analysis of the text, most likely first, at most 8.
${LEMMA_RULES}

${POLISH_RULES}`;

export const lookupAnalysisOnlyPrompt: PromptDefinition<LookupAnalysisOnlyInput, LookupAnalysisOnlyOutput> = {
  feature: 'lookup',
  version: LOOKUP_ANALYSIS_ONLY_PROMPT_VERSION,
  modelTier: 'fast',
  quotaBucket: 'lookup',
  schemaName: 'polish_lookup_analysis',
  instructions,
  schema: lookupAnalysisOnlyOutputSchema,
  maxOutputTokens: 1200,
  timeoutMs: 10_000,
  toModelInput: input => JSON.stringify({ text: input.key }),
  refine(output, input) {
    const warnings: string[] = [];
    const suggestion = refineSuggestion(output.suggestion, input.key, warnings);
    if (!output.isPolish) {
      if (output.analyses.length > 0) warnings.push('analyses_ignored_not_polish');
      return { ok: true, value: { isPolish: false, suggestion, analyses: [] }, warnings };
    }
    const refined = refineAnalyses(output.analyses, input.key, analysis => analysis);
    warnings.push(...refined.warnings);
    if (refined.droppedAll) return { ok: false, reason: 'all_analyses_invalid', warnings };
    return { ok: true, value: { isPolish: true, suggestion, analyses: refined.analyses }, warnings };
  },
};
