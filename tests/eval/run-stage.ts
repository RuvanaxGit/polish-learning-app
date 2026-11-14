import { deriveDiscriminator } from '../../shared/dictionary/lexeme-identity';
import { normalize } from '../../server/core/shared/text';
import {
  detailsPrompt,
  lookupAnalysisOnlyPrompt,
  lookupPrompt,
  priceForModel,
  shortTranslationPrompt,
} from '../../server/core/modules/llm/index';
import type { LlmProvider, LookupAnalysisOnlyOutput, ShortTranslationLexeme } from '../../server/core/modules/llm/index';
import { createEvalBudget, EvalStop } from './budget';
import { executeCall } from './call';
import type { CallRecord } from './call';
import type { EvalConfig, StageName } from './config';
import { GOLDEN_SET_STATUS } from './golden/morphology';
import { aggregateLookupScores, modelChoiceGates, percentile, repeatStability, scoreLookup } from './scoring';
import type { Gate, ItemScore, LookupMetrics, LookupOutcome, Ratio } from './scoring';
import { describeLexeme, planStage } from './stages';
import type { PlannedStep } from './stages';

export type TranslationRow = Readonly<{ subject: string; model: string; variant: string; language: string; lemma: string; pos: string; translation: string }>;

export type ModelVariantMetrics = Readonly<{
  model: string;
  variant: 'combined' | 'split';
  metrics: LookupMetrics;
  stability: Ratio | null;
  lookupLatencyP95Ms: number | null;
  gates: readonly Gate[];
}>;

export type StageReport = Readonly<{
  stage: StageName;
  startedAt: string;
  finishedAt: string;
  goldenSetStatus: string;
  promptVersions: Readonly<Record<string, string>>;
  fastModels: readonly string[];
  detailModels: readonly string[];
  capMicroUsd: number;
  spentMicroUsd: number;
  stopReason: string | null;
  plannedSteps: number;
  skippedSteps: number;
  records: readonly CallRecord[];
  scores: readonly Readonly<{ model: string; variant: 'combined' | 'split'; repetition: number; score: ItemScore }>[];
  lookupMetrics: readonly ModelVariantMetrics[];
  translationRows: readonly TranslationRow[];
}>;

// The analysis-only output is the shape both lookup variants share.
type Outputs = LookupAnalysisOnlyOutput;

function toOutcome(value: Outputs | null): LookupOutcome {
  if (value === null) return { ok: false, isPolish: false, suggestion: null, analyses: [] };
  return {
    ok: true,
    isPolish: value.isPolish,
    suggestion: value.suggestion,
    analyses: value.analyses.map(analysis => ({
      lemma: analysis.lemma,
      pos: analysis.pos,
      discriminator: deriveDiscriminator(analysis) ?? '',
      tags: analysis.tags,
    })),
  };
}

function distinctLexemes(analyses: Outputs['analyses']): ShortTranslationLexeme[] {
  const seen = new Map<string, ShortTranslationLexeme>();
  for (const analysis of analyses) {
    const lexeme = { lemma: analysis.lemma, pos: analysis.pos, discriminator: deriveDiscriminator(analysis) ?? '' };
    seen.set(`${normalize(lexeme.lemma).key}|${lexeme.pos}|${lexeme.discriminator}`, lexeme);
  }
  return [...seen.values()];
}

export type StageDeps = Readonly<{ provider: LlmProvider; now?: () => Date }>;

/**
 * Runs one evaluation stage sequentially. Fails closed: unknown model prices
 * abort before the first call; an EvalStop (cap reached, unknown usage, cost
 * above estimate, account/config errors) skips every remaining step.
 */
export async function runStage(
  stage: StageName,
  config: Pick<EvalConfig, 'fastModels' | 'detailModels' | 'capMicroUsd'>,
  deps: StageDeps,
): Promise<StageReport> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const plan = planStage(stage, config);
  for (const model of new Set(plan.map(step => step.model))) priceForModel(model);

  const budget = createEvalBudget(config.capMicroUsd);
  const callDeps = { provider: deps.provider, budget };
  const records: CallRecord[] = [];
  const scores: { model: string; variant: 'combined' | 'split'; repetition: number; score: ItemScore }[] = [];
  const translationRows: TranslationRow[] = [];
  let skippedSteps = 0;

  async function runStep(step: PlannedStep, index: number): Promise<void> {
    const callId = (suffix: string) => `${stage}-${String(index).padStart(3, '0')}-${suffix}`;

    if (step.type === 'lookup') {
      const { record, value } = await executeCall(callDeps, {
        callId: callId(`lookup-${step.item.id}-r${step.repetition}`),
        prompt: lookupPrompt,
        input: { key: normalize(step.item.input).key, language: step.language },
        model: step.model,
        variant: 'combined',
        repetition: step.repetition,
        subject: step.item.id,
        language: step.language,
      });
      records.push(record);
      scores.push({ model: step.model, variant: 'combined', repetition: step.repetition, score: scoreLookup(step.item, toOutcome(value)) });
      for (const analysis of value?.analyses ?? []) {
        translationRows.push({ subject: step.item.id, model: step.model, variant: 'combined', language: step.language, lemma: analysis.lemma, pos: analysis.pos, translation: analysis.shortTranslation });
      }
      return;
    }

    if (step.type === 'split') {
      const analysis = await executeCall(callDeps, {
        callId: callId(`split-analysis-${step.item.id}`),
        prompt: lookupAnalysisOnlyPrompt,
        input: { key: normalize(step.item.input).key },
        model: step.model,
        variant: 'split',
        repetition: 1,
        subject: step.item.id,
        language: null,
      });
      records.push(analysis.record);
      scores.push({ model: step.model, variant: 'split', repetition: 1, score: scoreLookup(step.item, toOutcome(analysis.value)) });
      const lexemes = distinctLexemes(analysis.value?.analyses ?? []);
      if (lexemes.length === 0) return;
      await runTranslation({ model: step.model, subject: step.item.id, lexemes, language: step.language }, callId(`split-translation-${step.item.id}`), 'split');
      return;
    }

    if (step.type === 'translation') {
      await runTranslation(step, callId(`translation-${step.language}-${step.subject}`), 'translation');
      return;
    }

    const { record } = await executeCall(callDeps, {
      callId: callId(`details-${step.lexeme.lemma}`),
      prompt: detailsPrompt,
      input: { ...step.lexeme, language: step.language },
      model: step.model,
      variant: 'details',
      repetition: 1,
      subject: describeLexeme(step.lexeme),
      language: step.language,
    });
    records.push(record);
  }

  async function runTranslation(
    step: Readonly<{ model: string; subject: string; lexemes: readonly ShortTranslationLexeme[]; language: PlannedStep['language'] }>,
    id: string,
    variant: string,
  ): Promise<void> {
    const { record, value } = await executeCall(callDeps, {
      callId: id,
      prompt: shortTranslationPrompt,
      input: { lexemes: step.lexemes, language: step.language },
      model: step.model,
      variant,
      repetition: 1,
      subject: step.subject,
      language: step.language,
    });
    records.push(record);
    for (const item of value?.items ?? []) {
      const lexeme = step.lexemes[item.index];
      if (lexeme) translationRows.push({ subject: step.subject, model: step.model, variant, language: step.language, lemma: lexeme.lemma, pos: lexeme.pos, translation: item.shortTranslation });
    }
  }

  for (const [index, step] of plan.entries()) {
    try {
      await runStep(step, index);
    }
    catch (error) {
      if (!(error instanceof EvalStop)) throw error;
      skippedSteps = plan.length - index;
      break;
    }
  }

  return {
    stage,
    startedAt,
    finishedAt: now().toISOString(),
    goldenSetStatus: GOLDEN_SET_STATUS,
    promptVersions: {
      lookup: lookupPrompt.version,
      lookupAnalysisOnly: lookupAnalysisOnlyPrompt.version,
      shortTranslation: shortTranslationPrompt.version,
      details: detailsPrompt.version,
    },
    fastModels: config.fastModels,
    detailModels: config.detailModels,
    capMicroUsd: budget.capMicroUsd,
    spentMicroUsd: budget.spentMicroUsd(),
    stopReason: budget.stopReason(),
    plannedSteps: plan.length,
    skippedSteps,
    records,
    scores,
    lookupMetrics: summarize(scores, records),
    translationRows,
  };
}

function summarize(
  scores: readonly Readonly<{ model: string; variant: 'combined' | 'split'; repetition: number; score: ItemScore }>[],
  records: readonly CallRecord[],
): ModelVariantMetrics[] {
  const groups = new Map<string, { model: string; variant: 'combined' | 'split' }>();
  for (const entry of scores) groups.set(`${entry.model}|${entry.variant}`, { model: entry.model, variant: entry.variant });

  return [...groups.values()].map(({ model, variant }) => {
    const group = scores.filter(entry => entry.model === model && entry.variant === variant);
    const repetitions = [...new Set(group.map(entry => entry.repetition))]
      .map(repetition => group.filter(entry => entry.repetition === repetition).map(entry => entry.score));
    // Accuracy metrics use the first repetition, so repetitions don't double-weight items.
    const metrics = aggregateLookupScores(repetitions[0] ?? []);
    const latencies = records
      .filter(record => record.feature === 'lookup' && record.model === model && record.variant === variant && record.status !== 'provider_error')
      .map(record => record.latencyMs);
    const lookupLatencyP95Ms = percentile(latencies, 95);
    return {
      model,
      variant,
      metrics,
      stability: repetitions.length > 1 ? repeatStability(repetitions) : null,
      lookupLatencyP95Ms,
      gates: modelChoiceGates(metrics, lookupLatencyP95Ms),
    };
  });
}
