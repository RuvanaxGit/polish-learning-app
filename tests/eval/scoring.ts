import { tagCategories } from '../../shared/contracts/dictionary';
import type { Discriminator, GrammaticalTags, PartOfSpeech } from '../../shared/contracts/dictionary';
import { normalize } from '../../server/core/shared/text';
import type { GoldenItem, GoldenReading, GoldenTier, TagSpec } from './golden/morphology';

export type AnalysisForScoring = Readonly<{
  lemma: string;
  pos: PartOfSpeech;
  discriminator: Discriminator;
  tags: GrammaticalTags;
}>;

/** `ok: false` = provider error, schema-invalid, or refine-rejected output. */
export type LookupOutcome = Readonly<{
  ok: boolean;
  isPolish: boolean;
  suggestion: string | null;
  analyses: readonly AnalysisForScoring[];
}>;

export type ConventionCheck = Readonly<{ check: string; passed: boolean }>;

export type ItemScore = Readonly<{
  itemId: string;
  tier: GoldenTier;
  ok: boolean;
  requiredTotal: number;
  requiredMatched: number;
  /** Required readings that specify tags. A missing reading counts here and is never correct. */
  tagReadingsTotal: number;
  /** ...of which an analysis was found (coverage). */
  tagReadingsFound: number;
  /** ...of which every matching analysis has acceptable tags (correctness). */
  tagReadingsCorrect: number;
  /** Tier `negative`: rejected as not Polish? Otherwise null. */
  negativeCorrect: boolean | null;
  /** Required suggestion produced? Null when not scored. */
  suggestionCorrect: boolean | null;
  conventions: readonly ConventionCheck[];
  /** Analyses matching no listed reading: for manual review, not counted as errors. */
  extras: readonly AnalysisForScoring[];
  /** Sorted lexeme identities, for repeat-run stability. */
  identityKeys: readonly string[];
}>;

const key = (text: string) => normalize(text).key;

function matchesReading(reading: GoldenReading, analysis: AnalysisForScoring): boolean {
  return reading.pos.includes(analysis.pos) && reading.lemmas.some(lemma => key(lemma) === key(analysis.lemma));
}

function fitsTagSpec(spec: TagSpec, tags: GrammaticalTags): boolean {
  return tagCategories.every(category => spec[category] === undefined || spec[category] === tags[category]);
}

function identityKey(analysis: AnalysisForScoring): string {
  return `${key(analysis.lemma)}|${analysis.pos}|${analysis.discriminator}`;
}

export function scoreLookup(item: GoldenItem, outcome: LookupOutcome): ItemScore {
  const required = item.required ?? [];
  const optional = item.optional ?? [];
  // A failed call is scored as a miss on everything it should have shown (fail-closed).
  const analyses = outcome.ok ? outcome.analyses : [];
  const conventions: ConventionCheck[] = [];

  let requiredMatched = 0;
  let tagReadingsTotal = 0;
  let tagReadingsFound = 0;
  let tagReadingsCorrect = 0;

  for (const reading of required) {
    const matching = analyses.filter(analysis => matchesReading(reading, analysis));
    if (matching.length > 0) requiredMatched += 1;

    // Scored per required reading, so a missing reading lowers accuracy
    // instead of dropping out of the denominator.
    if (reading.tags) {
      const specs = reading.tags;
      tagReadingsTotal += 1;
      if (matching.length > 0) {
        tagReadingsFound += 1;
        if (matching.every(analysis => specs.some(spec => fitsTagSpec(spec, analysis.tags)))) tagReadingsCorrect += 1;
      }
    }
    if (item.tier === 'C') conventions.push({ check: 'reading_present', passed: matching.length > 0 });
    const preferred = reading.lemmas[0];
    if (reading.lemmas.length > 1 && preferred !== undefined) {
      conventions.push({ check: 'preferred_lemma', passed: matching.some(analysis => key(analysis.lemma) === key(preferred)) });
    }
    if (reading.discriminators && matching.length > 0) {
      const accepted = reading.discriminators;
      conventions.push({ check: 'discriminator', passed: matching.every(analysis => accepted.includes(analysis.discriminator)) });
    }
  }

  if (item.singleLexeme) {
    conventions.push({ check: 'single_lexeme', passed: new Set(analyses.map(identityKey)).size === 1 });
  }
  if (item.forbiddenLemmas) {
    const forbidden = item.forbiddenLemmas.map(key);
    conventions.push({ check: 'forbidden_lemma_absent', passed: outcome.ok && !analyses.some(analysis => forbidden.includes(key(analysis.lemma))) });
  }
  if (required.length > 0 && item.suggestion === undefined) {
    conventions.push({ check: 'no_suggestion_for_valid_word', passed: outcome.ok && outcome.suggestion === null });
  }

  let suggestionCorrect: boolean | null = null;
  if (item.suggestion?.mode === 'required') {
    const accepted = item.suggestion.accepted.map(key);
    suggestionCorrect = outcome.ok && outcome.suggestion !== null && accepted.includes(key(outcome.suggestion));
  }

  const negativeCorrect = item.tier === 'negative' ? outcome.ok && (!outcome.isPolish || outcome.analyses.length === 0) : null;
  const listed = [...required, ...optional];
  const extras = analyses.filter(analysis => !listed.some(reading => matchesReading(reading, analysis)));

  return {
    itemId: item.id,
    tier: item.tier,
    ok: outcome.ok,
    requiredTotal: required.length,
    requiredMatched,
    tagReadingsTotal,
    tagReadingsFound,
    tagReadingsCorrect,
    negativeCorrect,
    suggestionCorrect,
    conventions,
    extras,
    identityKeys: [...new Set(analyses.map(identityKey))].sort(),
  };
}

export type Ratio = Readonly<{ numerator: number; denominator: number; value: number | null }>;

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

export type LookupMetrics = Readonly<{
  items: number;
  okRate: Ratio;
  /** Tier A: required readings found (Tier B lemma variants count). */
  tierALemmaRecall: Ratio;
  /** Tier A-amb: items with every required reading present. */
  ambiguityCoverage: Ratio;
  /** Tiers A and A-amb: tagged required readings found with correct tags; missing readings count as wrong (gated). */
  tagAccuracy: Ratio;
  /** Same readings, coverage only: found at all. */
  tagCoverage: Ratio;
  /** Same readings, correctness only: correct among those found (reported, not gated). */
  tagCorrectnessWhenFound: Ratio;
  negativeAccuracy: Ratio;
  suggestionAccuracy: Ratio;
  /** Tier C and convention checks on all items: prompt adherence (not gating). */
  conventionAdherence: Ratio;
  extraAnalyses: number;
}>;

export function aggregateLookupScores(scores: readonly ItemScore[]): LookupMetrics {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  const tierA = scores.filter(score => score.tier === 'A');
  const ambiguous = scores.filter(score => score.tier === 'A-amb');
  const gated = [...tierA, ...ambiguous];
  const negatives = scores.filter(score => score.negativeCorrect !== null);
  const suggestions = scores.filter(score => score.suggestionCorrect !== null);
  const conventions = scores.flatMap(score => score.conventions);

  return {
    items: scores.length,
    okRate: ratio(scores.filter(score => score.ok).length, scores.length),
    tierALemmaRecall: ratio(sum(tierA.map(score => score.requiredMatched)), sum(tierA.map(score => score.requiredTotal))),
    ambiguityCoverage: ratio(ambiguous.filter(score => score.requiredMatched === score.requiredTotal).length, ambiguous.length),
    tagAccuracy: ratio(sum(gated.map(score => score.tagReadingsCorrect)), sum(gated.map(score => score.tagReadingsTotal))),
    tagCoverage: ratio(sum(gated.map(score => score.tagReadingsFound)), sum(gated.map(score => score.tagReadingsTotal))),
    tagCorrectnessWhenFound: ratio(sum(gated.map(score => score.tagReadingsCorrect)), sum(gated.map(score => score.tagReadingsFound))),
    negativeAccuracy: ratio(negatives.filter(score => score.negativeCorrect).length, negatives.length),
    suggestionAccuracy: ratio(suggestions.filter(score => score.suggestionCorrect).length, suggestions.length),
    conventionAdherence: ratio(conventions.filter(check => check.passed).length, conventions.length),
    extraAnalyses: sum(scores.map(score => score.extras.length)),
  };
}

/** Share of items whose lexeme identities are identical in every repetition (risk R-09). */
export function repeatStability(repetitions: readonly (readonly ItemScore[])[]): Ratio {
  const byItem = new Map<string, string[]>();
  for (const run of repetitions) {
    for (const score of run) {
      if (!score.ok) continue;
      const list = byItem.get(score.itemId) ?? [];
      list.push(score.identityKeys.join(';'));
      byItem.set(score.itemId, list);
    }
  }
  const compared = [...byItem.values()].filter(list => list.length > 1);
  return ratio(compared.filter(list => new Set(list).size === 1).length, compared.length);
}

export type Gate = Readonly<{ name: string; threshold: number; actual: number | null; passed: boolean }>;

/**
 * Model-choice gates (plan R2-4). Convention adherence is reported, never gated.
 * `completeness` = executed / planned cases: an incomplete run can never pass.
 */
export function modelChoiceGates(metrics: LookupMetrics, lookupLatencyP95Ms: number | null, completeness: Ratio): readonly Gate[] {
  const atLeast = (name: string, value: number | null, threshold: number): Gate =>
    ({ name, threshold, actual: value, passed: value !== null && value >= threshold });
  return [
    atLeast('run_complete', completeness.value, 1),
    atLeast('tier_a_lemma_recall', metrics.tierALemmaRecall.value, 0.9),
    atLeast('ambiguity_coverage', metrics.ambiguityCoverage.value, 0.8),
    atLeast('tag_accuracy', metrics.tagAccuracy.value, 0.85),
    atLeast('schema_valid_rate', metrics.okRate.value, 1),
    { name: 'lookup_latency_p95_ms', threshold: 4000, actual: lookupLatencyP95Ms, passed: lookupLatencyP95Ms !== null && lookupLatencyP95Ms < 4000 },
  ];
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? null;
}
