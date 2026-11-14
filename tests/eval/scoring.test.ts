import { describe, expect, it } from 'vitest';
import type { GrammaticalTags } from '../../shared/contracts/dictionary';
import { goldenItem } from './golden/morphology';
import { aggregateLookupScores, modelChoiceGates, percentile, repeatStability, scoreLookup } from './scoring';
import type { AnalysisForScoring, LookupOutcome } from './scoring';

const none: GrammaticalTags = { verbForm: null, case: null, number: null, gender: null, person: null, tense: null, mood: null, degree: null };

function a(lemma: string, pos: AnalysisForScoring['pos'], discriminator: AnalysisForScoring['discriminator'], tags: Partial<GrammaticalTags> = {}): AnalysisForScoring {
  return { lemma, pos, discriminator, tags: { ...none, ...tags } };
}

function outcome(analyses: AnalysisForScoring[], overrides: Partial<LookupOutcome> = {}): LookupOutcome {
  return { ok: true, isPolish: true, suggestion: null, analyses, ...overrides };
}

describe('scoreLookup', () => {
  it('scores a correct analysis of psa', () => {
    const score = scoreLookup(goldenItem('noun-psa'), outcome([
      a('pies', 'noun', 'm2', { case: 'gen', number: 'sg' }),
      a('pies', 'noun', 'm2', { case: 'acc', number: 'sg' }),
    ]));
    expect(score).toMatchObject({ requiredMatched: 1, requiredTotal: 1, tagsChecked: 2, tagsCorrect: 2, extras: [] });
    expect(score.conventions.every(check => check.passed)).toBe(true);
  });

  it('counts wrong tags without failing lemma recall', () => {
    const score = scoreLookup(goldenItem('noun-psa'), outcome([a('pies', 'noun', 'm2', { case: 'nom', number: 'sg' })]));
    expect(score).toMatchObject({ requiredMatched: 1, tagsChecked: 1, tagsCorrect: 0 });
  });

  it('requires every reading of an ambiguous form', () => {
    const score = scoreLookup(goldenItem('amb-mam'), outcome([a('mieć', 'verb', 'impf', { tense: 'present', person: '1', number: 'sg' })]));
    expect(score).toMatchObject({ requiredMatched: 1, requiredTotal: 2 });
  });

  it('accepts a Tier B lemma variant but reports the product convention as not followed', () => {
    const score = scoreLookup(goldenItem('verb-zrobiony'), outcome([a('zrobiony', 'adj', '')]));
    expect(score.requiredMatched).toBe(1);
    expect(score.conventions).toContainEqual({ check: 'preferred_lemma', passed: false });
  });

  it('checks the single-lexeme convention for same-paradigm homonyms', () => {
    const split = scoreLookup(goldenItem('conv-zamek'), outcome([a('zamek', 'noun', 'm3', { case: 'nom', number: 'sg' }), a('zamek', 'noun', 'm1', { case: 'nom', number: 'sg' })]));
    expect(split.conventions).toContainEqual({ check: 'single_lexeme', passed: false });
    expect(split.conventions).toContainEqual({ check: 'discriminator', passed: false });
  });

  it('flags forbidden lemmas and lists unlisted analyses as extras', () => {
    const score = scoreLookup(goldenItem('conv-piesek'), outcome([a('piesek', 'noun', 'm2', { case: 'nom', number: 'sg' }), a('pies', 'noun', 'm2')]));
    expect(score.conventions).toContainEqual({ check: 'forbidden_lemma_absent', passed: false });
    expect(score.extras.map(extra => extra.lemma)).toEqual(['pies']);
  });

  it('flags a suggestion for a valid word, and scores required suggestions', () => {
    const valid = scoreLookup(goldenItem('base-pies'), outcome([a('pies', 'noun', 'm2', { case: 'nom', number: 'sg' })], { suggestion: 'piec' }));
    expect(valid.conventions).toContainEqual({ check: 'no_suggestion_for_valid_word', passed: false });

    expect(scoreLookup(goldenItem('sugg-zolw'), outcome([], { suggestion: 'Żółw' })).suggestionCorrect).toBe(true);
    expect(scoreLookup(goldenItem('sugg-zolw'), outcome([])).suggestionCorrect).toBe(false);
  });

  it('scores negatives and treats failed calls as misses (fail-closed)', () => {
    expect(scoreLookup(goldenItem('neg-hund'), outcome([], { isPolish: false })).negativeCorrect).toBe(true);
    expect(scoreLookup(goldenItem('neg-hund'), outcome([], { ok: false })).negativeCorrect).toBe(false);
    const failed = scoreLookup(goldenItem('noun-psa'), outcome([a('pies', 'noun', 'm2')], { ok: false }));
    expect(failed).toMatchObject({ ok: false, requiredMatched: 0 });
  });
});

describe('aggregates and gates', () => {
  it('computes tier metrics separately', () => {
    const scores = [
      scoreLookup(goldenItem('noun-psa'), outcome([a('pies', 'noun', 'm2', { case: 'gen', number: 'sg' })])),
      scoreLookup(goldenItem('noun-rak'), outcome([a('ręka', 'noun', 'f', { case: 'gen', number: 'pl' })])),
      scoreLookup(goldenItem('amb-mam'), outcome([a('mieć', 'verb', 'impf')])),
      scoreLookup(goldenItem('neg-hund'), outcome([], { isPolish: false })),
    ];
    const metrics = aggregateLookupScores(scores);
    expect(metrics.tierALemmaRecall).toMatchObject({ numerator: 2, denominator: 2, value: 1 });
    expect(metrics.ambiguityCoverage).toMatchObject({ numerator: 0, denominator: 1 });
    expect(metrics.negativeAccuracy.value).toBe(1);

    const gates = modelChoiceGates(metrics, 1200);
    expect(gates.find(gate => gate.name === 'tier_a_lemma_recall')?.passed).toBe(true);
    expect(gates.find(gate => gate.name === 'ambiguity_coverage')?.passed).toBe(false);
    expect(gates.find(gate => gate.name === 'lookup_latency_p95_ms')?.passed).toBe(true);
  });

  it('measures repeat stability of lexeme identities', () => {
    const run = (discriminator: 'm2' | 'm1') => [scoreLookup(goldenItem('noun-psa'), outcome([a('pies', 'noun', discriminator)]))];
    expect(repeatStability([run('m2'), run('m2')]).value).toBe(1);
    expect(repeatStability([run('m2'), run('m1')]).value).toBe(0);
  });

  it('computes nearest-rank percentiles', () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([100, 200, 300, 400], 95)).toBe(400);
    expect(percentile([100, 200, 300, 400], 50)).toBe(200);
  });
});
