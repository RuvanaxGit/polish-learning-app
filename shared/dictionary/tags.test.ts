import { describe, expect, it } from 'vitest';
import type { GrammaticalTags } from '../contracts/dictionary';
import { buildTagKey } from './tags';

const none: GrammaticalTags = { verbForm: null, case: null, number: null, gender: null, person: null, tense: null, mood: null, degree: null };

describe('buildTagKey', () => {
  it('lists non-null categories in the fixed order', () => {
    expect(buildTagKey({ ...none, number: 'sg', case: 'gen' })).toBe('case=gen|number=sg');
    expect(buildTagKey({ ...none, gender: 'f', person: '1', tense: 'past', number: 'sg', verbForm: 'finite' }))
      .toBe('verbForm=finite|number=sg|gender=f|person=1|tense=past');
  });

  it('is independent of property order', () => {
    const a: GrammaticalTags = { ...none, case: 'inst', number: 'pl', degree: 'sup' };
    const b: GrammaticalTags = { degree: 'sup', number: 'pl', case: 'inst', verbForm: null, gender: null, person: null, tense: null, mood: null };
    expect(buildTagKey(a)).toBe(buildTagKey(b));
  });

  it('is empty when every category is null', () => {
    expect(buildTagKey(none)).toBe('');
  });
});
