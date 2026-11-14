import { z } from 'zod';
import { grammaticalTagsSchema, registers } from '../../../../../shared/contracts/dictionary';
import type { Discriminator, PartOfSpeech } from '../../../../../shared/contracts/dictionary';
import type { TranslationLanguage } from '../../../../../shared/contracts/settings';
import { buildTagKey } from '../../../../../shared/dictionary/tags';
import type { PromptDefinition } from '../domain/prompt';
import { cleanText, DATA_ONLY_RULE, LANGUAGE_NAMES } from './common';

export const DETAILS_PROMPT_VERSION = 'details-1-draft.1';

const MAX_MEANINGS = 6;
const MAX_EXAMPLES = 5;
const MAX_FORMS = 120;
const MAX_SHORT_TEXT = 300;
const MAX_LONG_TEXT = 500;

export type DetailsPromptInput = Readonly<{
  lemma: string;
  pos: PartOfSpeech;
  discriminator: Discriminator;
  language: TranslationLanguage;
}>;

export const detailsOutputSchema = z.object({
  meanings: z.array(z.object({
    translation: z.string(),
    explanation: z.string().nullable(),
    register: z.enum(registers).nullable(),
    examples: z.array(z.object({ pl: z.string(), translation: z.string() })),
  })),
  forms: z.array(z.object({ form: z.string(), tags: grammaticalTagsSchema })),
  aspectPartner: z.string().nullable(),
  notes: z.string().nullable(),
});

export type DetailsOutput = z.infer<typeof detailsOutputSchema>;

const instructions = `You write concise dictionary entries for learners of Polish.
The user message is a JSON object with a Polish lemma, its part of speech, its gender (nouns) or aspect (verbs), and "translationLanguage". ${DATA_ONLY_RULE}

Write translations and explanations in translationLanguage; Polish examples stay in Polish.
- meanings: the main senses, most common first, at most 6. Each has a short translation, a one-sentence explanation or null, a register (formal, neutral, colloquial, vulgar) or null, and 2 to 5 natural Polish example sentences with translations. Homonyms of the same word (zamek: castle, lock, zipper) are separate meanings.
- forms: for nouns, adjectives, pronouns and numerals, the declension (case and number; for adjectives also gender: m1, m2, m3, f, n, and nonvir in the plural). For verbs: the infinitive, the present tense (simple future for perfective verbs) for all persons and numbers, the past tense by person, number and gender, the imperative, and the main participles. Other parts of speech: an empty list. Null for categories that do not apply.
- aspectPartner: for verbs, the infinitive of the aspect partner if one exists; otherwise null.
- notes: one short usage note (irregularity, case government, false friend) or null.`;

export const detailsPrompt: PromptDefinition<DetailsPromptInput, DetailsOutput> = {
  feature: 'details',
  version: DETAILS_PROMPT_VERSION,
  modelTier: 'detail',
  quotaBucket: 'details',
  schemaName: 'polish_details',
  instructions,
  schema: detailsOutputSchema,
  maxOutputTokens: 4000,
  timeoutMs: 30_000,
  toModelInput: input => JSON.stringify({
    lemma: input.lemma,
    pos: input.pos,
    gender: input.pos === 'noun' ? input.discriminator : null,
    aspect: input.pos === 'verb' ? input.discriminator : null,
    translationLanguage: LANGUAGE_NAMES[input.language],
  }),
  refine(output, input) {
    const warnings: string[] = [];

    const meanings = output.meanings.flatMap((meaning, index) => {
      const translation = cleanText(meaning.translation, MAX_SHORT_TEXT);
      if (translation === null) {
        warnings.push(`meaning_${index}_invalid_translation`);
        return [];
      }
      const examples = meaning.examples.flatMap((example) => {
        const pl = cleanText(example.pl, MAX_SHORT_TEXT);
        const exampleTranslation = cleanText(example.translation, MAX_SHORT_TEXT);
        return pl === null || exampleTranslation === null ? [] : [{ pl, translation: exampleTranslation }];
      });
      if (examples.length < 2) warnings.push(`meaning_${index}_few_examples`);
      return [{
        translation,
        explanation: meaning.explanation === null ? null : cleanText(meaning.explanation, MAX_LONG_TEXT),
        register: meaning.register,
        examples: examples.slice(0, MAX_EXAMPLES),
      }];
    });
    if (meanings.length === 0) return { ok: false, reason: 'no_valid_meanings', warnings };
    if (meanings.length > MAX_MEANINGS) warnings.push('meanings_truncated');

    const seenForms = new Set<string>();
    const forms = output.forms.flatMap((entry) => {
      const form = cleanText(entry.form, MAX_SHORT_TEXT);
      if (form === null) return [];
      const identity = `${form.toLowerCase()}|${buildTagKey(entry.tags)}`;
      if (seenForms.has(identity)) return [];
      seenForms.add(identity);
      return [{ form, tags: entry.tags }];
    });
    if (forms.length > MAX_FORMS) warnings.push('forms_truncated');

    const aspectPartner = input.pos === 'verb' && output.aspectPartner !== null ? cleanText(output.aspectPartner, 100) : null;
    const notes = output.notes === null ? null : cleanText(output.notes, MAX_LONG_TEXT);

    return {
      ok: true,
      value: { meanings: meanings.slice(0, MAX_MEANINGS), forms: forms.slice(0, MAX_FORMS), aspectPartner, notes },
      warnings,
    };
  },
};
