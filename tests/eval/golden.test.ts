import { describe, expect, it } from 'vitest';
import { normalize } from '../../server/core/shared/text';
import { goldenItem, goldenItems } from './golden/morphology';
import { DETAILS_LEXEMES, PILOT_ITEM_IDS, preferredLexemes, TRANSLATION_SUBSET_IDS } from './stages';

const latinLetter = /\p{Script=Latin}/u;

describe('golden dataset integrity', () => {
  it('has unique ids and unique normalized inputs', () => {
    expect(new Set(goldenItems.map(item => item.id)).size).toBe(goldenItems.length);
    expect(new Set(goldenItems.map(item => normalize(item.input).key)).size).toBe(goldenItems.length);
  });

  it('stores inputs and lemmas already normalized', () => {
    for (const item of goldenItems) {
      expect(normalize(item.input).display, item.id).toBe(item.input);
      for (const reading of [...(item.required ?? []), ...(item.optional ?? [])]) {
        expect(reading.lemmas.length, item.id).toBeGreaterThan(0);
        for (const lemma of reading.lemmas) expect(normalize(lemma).display, item.id).toBe(lemma);
      }
    }
  });

  it('gives every tier the expectations it is scored on', () => {
    for (const item of goldenItems) {
      if (item.tier === 'A' || item.tier === 'A-amb' || item.tier === 'C') expect(item.required?.length, item.id).toBeGreaterThan(0);
      if (item.tier === 'A-amb' && item.optional === undefined) expect(item.required?.length, item.id).toBeGreaterThan(1);
      if (item.tier === 'suggestion') expect(item.suggestion?.mode, item.id).toBe('required');
      if (item.tier === 'negative' || item.tier === 'suggestion') expect(item.required, item.id).toBeUndefined();
    }
  });

  it('records a discriminator for every unambiguous noun or verb reading', () => {
    for (const item of goldenItems) {
      for (const reading of item.required ?? []) {
        if (reading.pos.length === 1 && (reading.pos[0] === 'noun' || reading.pos[0] === 'verb')) {
          expect(reading.discriminators?.length, `${item.id} ${reading.lemmas[0]}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('marks exactly the inputs without Latin letters as local rejects', () => {
    for (const item of goldenItems) expect(Boolean(item.localReject), item.id).toBe(!latinLetter.test(item.input));
  });

  it('references only existing, LLM-bound items in the stage subsets', () => {
    for (const id of [...PILOT_ITEM_IDS, ...TRANSLATION_SUBSET_IDS]) expect(goldenItem(id).localReject, id).toBeFalsy();
    for (const id of TRANSLATION_SUBSET_IDS) expect(preferredLexemes(goldenItem(id)).length, id).toBeGreaterThan(0);
    expect(TRANSLATION_SUBSET_IDS).toHaveLength(15);
    expect(DETAILS_LEXEMES).toHaveLength(10);
  });
});
