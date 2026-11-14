import { describe, expect, it } from 'vitest';
import { normalize } from './text';

describe('normalize', () => {
  it('trims, collapses whitespace, and keeps casing in display', () => {
    expect(normalize('  Dzień \t  dobry \n')).toEqual({ display: 'Dzień dobry', key: 'dzień dobry', length: 11 });
  });

  it('composes NFD input to NFC (same key for both encodings)', () => {
    const decomposed = 'żółw'; // ż (z + dot above), ó (o + acute), ł
    const result = normalize(decomposed);
    expect(result.display).toBe('żółw');
    expect(result.display.normalize('NFC')).toBe(result.display);
    expect(result.key).toBe(normalize('żółw').key);
  });

  it('lowercases every Polish capital in the key', () => {
    expect(normalize('ĄĆĘŁŃÓŚŹŻ').key).toBe('ąćęłńóśźż');
  });

  it('never strips diacritics', () => {
    expect(normalize('zolw').key).toBe('zolw');
    expect(normalize('żółw').key).toBe('żółw');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(normalize('ż'.repeat(100)).length).toBe(100);
    expect(normalize('😀').length).toBe(1);
  });

  it('returns empty strings for whitespace-only input', () => {
    expect(normalize(' \n\t ')).toEqual({ display: '', key: '', length: 0 });
  });
});
