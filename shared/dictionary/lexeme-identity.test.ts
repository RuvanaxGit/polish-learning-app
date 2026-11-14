import { describe, expect, it } from 'vitest';
import { deriveDiscriminator } from './lexeme-identity';

describe('deriveDiscriminator', () => {
  it('uses gender for nouns, including plural-only', () => {
    expect(deriveDiscriminator({ pos: 'noun', gender: 'm2', aspect: null })).toBe('m2');
    expect(deriveDiscriminator({ pos: 'noun', gender: 'pt', aspect: null })).toBe('pt');
  });

  it('uses aspect for verbs', () => {
    expect(deriveDiscriminator({ pos: 'verb', gender: null, aspect: 'pf' })).toBe('pf');
  });

  it('is empty for all other parts of speech, ignoring stray grammar', () => {
    expect(deriveDiscriminator({ pos: 'adj', gender: 'f', aspect: 'impf' })).toBe('');
    expect(deriveDiscriminator({ pos: 'phrase', gender: null, aspect: null })).toBe('');
  });

  it('returns null when a noun has no gender or a verb has no aspect', () => {
    expect(deriveDiscriminator({ pos: 'noun', gender: null, aspect: 'impf' })).toBeNull();
    expect(deriveDiscriminator({ pos: 'verb', gender: 'm1', aspect: null })).toBeNull();
  });
});
