import { z } from 'zod';
import {
  confidenceLevels,
  grammaticalTagsSchema,
  nounGenders,
  partsOfSpeech,
  verbAspects,
} from '../../../../../shared/contracts/dictionary';
import { deriveDiscriminator } from '../../../../../shared/dictionary/lexeme-identity';
import { buildTagKey } from '../../../../../shared/dictionary/tags';
import { normalize } from '../../../shared/text';

// Pieces shared by the combined lookup prompt and its analysis-only variant
// (the variant exists for the live evaluation's combined-vs-split comparison).

export const MAX_ANALYSES = 8;
export const MAX_LEMMA_LENGTH = 100;
export const MAX_SUGGESTION_LENGTH = 100;

export const analysisCoreShape = {
  lemma: z.string(),
  pos: z.enum(partsOfSpeech),
  gender: z.enum(nounGenders).nullable(),
  aspect: z.enum(verbAspects).nullable(),
  form: z.string(),
  tags: grammaticalTagsSchema,
  confidence: z.enum(confidenceLevels),
};

export type AnalysisCore = z.infer<z.ZodObject<typeof analysisCoreShape>>;

export const LEMMA_RULES = `For each analysis:
- lemma: the dictionary form. Nouns, adjectives, pronouns and numerals: nominative singular (plural-only nouns: nominative plural). Comparatives and superlatives map to the positive degree (najlepszy → dobry, lepiej → dobrze). All verb forms, including participles, gerunds and impersonal forms, map to the infinitive (zrobiony → zrobić). Diminutives are their own lemma (piesek). Reflexive verbs keep "się" (bać się). Capitalize only proper nouns.
- pos: use "phrase" for a multi-word expression that is not a single reflexive verb.
- gender: nouns only: m1 (masculine personal), m2 (masculine animate), m3 (masculine inanimate), f, n, or pt (plural-only noun). Null for other parts of speech.
- aspect: verbs only: impf, pf, or biasp; null otherwise. Aspect partners (robić, zrobić) are separate lemmas.
- form: the analyzed text exactly as given.
- tags: grammatical features of this form; null where a category does not apply. verbForm: finite, infinitive, pact (active participle), ppas (passive participle), pcon (present adverbial participle), pant (anterior adverbial participle), ger (gerund), impersonal (-no/-to form). Form gender: m1, m2, m3, f, n, or nonvir (plural non-virile). person: 1, 2, 3.
- When this form has several readings of the same lemma (for example genitive and accusative), return each reading as a separate analysis.
- Homonyms with the same lemma, part of speech and gender or aspect (zamek: castle, lock, zipper) are one lexeme: do not split them by meaning.
- confidence: high, medium, or low.`;

export const POLISH_RULES = `isPolish: false when the text is not Polish; then return no analyses.
suggestion: only when the text looks like a Polish word typed without diacritics or with a typo (zolw → żółw); otherwise null. Never suggest a change for a valid Polish word.`;

export type RefinedAnalyses<A> = Readonly<{ analyses: A[]; warnings: string[]; droppedAll: boolean }>;

/**
 * Applies identity and consistency rules to model analyses (ARCHITECTURE.md
 * 7.3, 10.2): drops analyses whose form is not the input, nouns without gender,
 * verbs without aspect, invalid lemmas, and duplicates; caps the count.
 * `refineExtra` validates prompt-specific fields and returns null to drop.
 */
export function refineAnalyses<A extends AnalysisCore>(
  raw: readonly A[],
  inputKey: string,
  refineExtra: (analysis: A, index: number, warnings: string[]) => A | null,
): RefinedAnalyses<A> {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const kept: A[] = [];

  raw.forEach((analysis, index) => {
    const lemma = normalize(analysis.lemma);
    if (lemma.length === 0 || lemma.length > MAX_LEMMA_LENGTH) {
      warnings.push(`analysis_${index}_invalid_lemma`);
      return;
    }
    const form = normalize(analysis.form);
    if (form.key !== inputKey) {
      warnings.push(`analysis_${index}_form_mismatch`);
      return;
    }
    const gender = analysis.pos === 'noun' ? analysis.gender : null;
    const aspect = analysis.pos === 'verb' ? analysis.aspect : null;
    const discriminator = deriveDiscriminator({ pos: analysis.pos, gender, aspect });
    if (discriminator === null) {
      warnings.push(`analysis_${index}_missing_${analysis.pos === 'noun' ? 'gender' : 'aspect'}`);
      return;
    }
    const identity = `${lemma.key}|${analysis.pos}|${discriminator}|${buildTagKey(analysis.tags)}`;
    if (seen.has(identity)) {
      warnings.push(`analysis_${index}_duplicate`);
      return;
    }
    const refined = refineExtra({ ...analysis, lemma: lemma.display, form: form.display, gender, aspect }, index, warnings);
    if (refined === null) return;
    seen.add(identity);
    kept.push(refined);
  });

  if (kept.length > MAX_ANALYSES) {
    warnings.push('analyses_truncated');
    kept.length = MAX_ANALYSES;
  }
  return { analyses: kept, warnings, droppedAll: raw.length > 0 && kept.length === 0 };
}

/** A suggestion is kept only if it is a normalized, different, reasonably short text. */
export function refineSuggestion(suggestion: string | null, inputKey: string, warnings: string[]): string | null {
  if (suggestion === null) return null;
  const normalized = normalize(suggestion);
  if (normalized.length === 0 || normalized.length > MAX_SUGGESTION_LENGTH || normalized.key === inputKey) {
    warnings.push('suggestion_dropped');
    return null;
  }
  return normalized.display;
}
