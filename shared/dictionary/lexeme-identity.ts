import type { Discriminator, NounGender, PartOfSpeech, VerbAspect } from '../contracts/dictionary';

export type LexemeGrammar = Readonly<{
  pos: PartOfSpeech;
  gender: NounGender | null;
  aspect: VerbAspect | null;
}>;

/**
 * Derives the lexeme identity discriminator (ARCHITECTURE.md 7.3) from
 * lexeme-level grammar. Returns null when the grammar is incomplete: a noun
 * without gender or a verb without aspect can't be given a stable identity.
 *
 * Lives in shared/ (not the dictionary module) because the LLM prompt
 * validation needs it too, and llm must not depend on dictionary.
 */
export function deriveDiscriminator(grammar: LexemeGrammar): Discriminator | null {
  if (grammar.pos === 'noun') return grammar.gender;
  if (grammar.pos === 'verb') return grammar.aspect;
  return '';
}
