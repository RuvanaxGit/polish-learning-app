import { tagCategories } from '../contracts/dictionary';
import type { GrammaticalTags } from '../contracts/dictionary';

/**
 * Canonical string for a tag set: categories in a fixed order, nulls skipped,
 * e.g. `case=gen|number=sg`. The single source of `word_forms.tag_key`
 * (ARCHITECTURE.md 7.3). An empty tag set yields ''.
 */
export function buildTagKey(tags: GrammaticalTags): string {
  return tagCategories
    .flatMap((category) => {
      const value = tags[category];
      return value === null ? [] : [`${category}=${value}`];
    })
    .join('|');
}
