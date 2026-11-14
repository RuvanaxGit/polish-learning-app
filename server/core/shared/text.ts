/** Maximum length of a lookup query after normalization, in code points (PRD US-03). */
export const MAX_QUERY_LENGTH = 100;

export type NormalizedText = Readonly<{
  /** NFC, trimmed, internal whitespace collapsed to single spaces; casing kept. */
  display: string;
  /** `display` lowercased: the lookup and identity key. */
  key: string;
  /** Length of `display` in code points (not UTF-16 units). */
  length: number;
}>;

/**
 * The single text normalization function (DECISIONS R-08). Diacritics are
 * preserved: input without them is never rewritten here.
 */
export function normalize(input: string): NormalizedText {
  const display = input.normalize('NFC').trim().replace(/\s+/gu, ' ');
  // Lowercasing can in theory produce a non-NFC sequence, so normalize again.
  const key = display.toLowerCase().normalize('NFC');
  return { display, key, length: [...display].length };
}
