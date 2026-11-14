import { z } from 'zod';
import type { Discriminator, PartOfSpeech } from '../../../../../shared/contracts/dictionary';
import type { TranslationLanguage } from '../../../../../shared/contracts/settings';
import type { PromptDefinition } from '../domain/prompt';
import { cleanText, DATA_ONLY_RULE, LANGUAGE_NAMES } from './common';
import { MAX_SHORT_TRANSLATION_LENGTH } from './lookup.v1';

export const SHORT_TRANSLATION_PROMPT_VERSION = 'short-translation-1-draft.1';

export type ShortTranslationLexeme = Readonly<{ lemma: string; pos: PartOfSpeech; discriminator: Discriminator }>;

export type ShortTranslationInput = Readonly<{
  lexemes: readonly ShortTranslationLexeme[];
  language: TranslationLanguage;
}>;

export const shortTranslationOutputSchema = z.object({
  items: z.array(z.object({ index: z.int(), shortTranslation: z.string() })),
});

export type ShortTranslationOutput = z.infer<typeof shortTranslationOutputSchema>;

const instructions = `You translate Polish dictionary words for a vocabulary app.
The user message is a JSON object with "translationLanguage" and "items"; each item has an index, a lemma, a part of speech, and a gender (nouns) or aspect (verbs). ${DATA_ONLY_RULE}

For each item return its index and a short translation of the lemma into translationLanguage: at most about 8 words; when the word has several distinct common senses, list the main ones separated by ", ". Return exactly one entry per item.`;

function modelItem(lexeme: ShortTranslationLexeme, index: number) {
  return {
    index,
    lemma: lexeme.lemma,
    pos: lexeme.pos,
    gender: lexeme.pos === 'noun' ? lexeme.discriminator : null,
    aspect: lexeme.pos === 'verb' ? lexeme.discriminator : null,
  };
}

export const shortTranslationPrompt: PromptDefinition<ShortTranslationInput, ShortTranslationOutput> = {
  feature: 'short_translation',
  version: SHORT_TRANSLATION_PROMPT_VERSION,
  modelTier: 'fast',
  quotaBucket: 'lookup',
  schemaName: 'polish_short_translations',
  instructions,
  schema: shortTranslationOutputSchema,
  maxOutputTokens: 800,
  timeoutMs: 10_000,
  toModelInput: input => JSON.stringify({
    translationLanguage: LANGUAGE_NAMES[input.language],
    items: input.lexemes.map(modelItem),
  }),
  refine(output, input) {
    const warnings: string[] = [];
    const byIndex = new Map<number, string>();
    for (const item of output.items) {
      if (item.index < 0 || item.index >= input.lexemes.length || byIndex.has(item.index)) {
        return { ok: false, reason: 'invalid_or_duplicate_index', warnings };
      }
      const shortTranslation = cleanText(item.shortTranslation, MAX_SHORT_TRANSLATION_LENGTH);
      if (shortTranslation === null) return { ok: false, reason: `invalid_translation_${item.index}`, warnings };
      byIndex.set(item.index, shortTranslation);
    }
    if (byIndex.size !== input.lexemes.length) return { ok: false, reason: 'missing_items', warnings };
    const items = [...byIndex].sort(([a], [b]) => a - b).map(([index, shortTranslation]) => ({ index, shortTranslation }));
    return { ok: true, value: { items }, warnings };
  },
};
