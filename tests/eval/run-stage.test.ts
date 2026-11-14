import { describe, expect, it } from 'vitest';
import {
  detailsPrompt,
  estimatedCostMicroUsd,
  estimateRequest,
  lookupPrompt,
  priceForModel,
  UnknownModelPriceError,
} from '../../server/core/modules/llm/index';
import type { LlmProvider, ProviderRequest, ProviderResult, ProviderUsage } from '../../server/core/modules/llm/index';
import { createEvalBudget, EvalStop } from './budget';
import { llmBoundItems } from './golden/morphology';
import { runStage } from './run-stage';
import { PILOT_ITEM_IDS, planStage } from './stages';

// Offline: a stub provider stands in for OpenAI. No network, no key.

const FAST = 'gpt-6-luna';
const DETAIL = 'gpt-6.1-sol';
const usage: ProviderUsage = { inputTokens: 900, cachedInputTokens: 0, outputTokens: 300, reasoningTokens: 0 };
const tags = { verbForm: null, case: 'nom', number: 'sg', gender: null, person: null, tense: null, mood: null, degree: null };

type Responder = (request: ProviderRequest<unknown>, input: Record<string, unknown>) => ProviderResult<unknown> | 'valid';

function validOutput(request: ProviderRequest<unknown>, input: Record<string, unknown>): unknown {
  const text = String(input.text ?? '');
  const analysis = { lemma: text, pos: 'noun', gender: 'm3', aspect: null, form: text, tags, confidence: 'high' };
  switch (request.schemaName) {
    case 'polish_lookup': return { isPolish: true, suggestion: null, analyses: [{ ...analysis, shortTranslation: 'перевод' }] };
    case 'polish_lookup_analysis': return { isPolish: true, suggestion: null, analyses: [analysis] };
    case 'polish_short_translations': return { items: (input.items as unknown[]).map((_, index) => ({ index, shortTranslation: 'translation' })) };
    case 'polish_details': return { meanings: [{ translation: 'собака', explanation: null, register: null, examples: [{ pl: 'Pies śpi.', translation: 'Собака спит.' }, { pl: 'Mam psa.', translation: 'У меня есть собака.' }] }], forms: [], aspectPartner: null, notes: null };
    default: throw new Error(`unexpected schema ${request.schemaName}`);
  }
}

function stubProvider(respond: Responder = () => 'valid') {
  const calls: ProviderRequest<unknown>[] = [];
  const provider: LlmProvider = {
    id: 'stub',
    async complete<T>(request: ProviderRequest<T>): Promise<ProviderResult<T>> {
      calls.push(request);
      const input = JSON.parse(request.input) as Record<string, unknown>;
      const response = respond(request, input);
      if (response !== 'valid') {
        if (response.kind === 'ok') return { ...response, output: request.schema.parse(response.output) };
        return response;
      }
      return { kind: 'ok', output: request.schema.parse(validOutput(request, input)), usage, latencyMs: 25 };
    },
  };
  return { provider, calls };
}

const config = { fastModels: [FAST], detailModels: [DETAIL], capMicroUsd: 250_000 };
const fixedNow = () => new Date('2026-11-14T12:00:00Z');

function firstLookupEstimate(): number {
  const input = lookupPrompt.toModelInput({ key: 'psa', language: 'ru' });
  return estimatedCostMicroUsd(estimateRequest({ instructions: lookupPrompt.instructions, input, schema: lookupPrompt.schema, maxOutputTokens: lookupPrompt.maxOutputTokens }), priceForModel(FAST));
}

describe('runStage: smoke', () => {
  it('makes exactly three accounted calls and charges actual provider usage', async () => {
    const { provider, calls } = stubProvider();
    const report = await runStage('smoke', config, { provider, now: fixedNow });

    expect(calls.map(call => [call.schemaName, call.model])).toEqual([
      ['polish_lookup', FAST], ['polish_short_translations', FAST], ['polish_details', DETAIL],
    ]);
    expect(report.records.map(record => [record.status, record.accounting])).toEqual([['ok', 'actual'], ['ok', 'actual'], ['ok', 'actual']]);
    expect(report.spentMicroUsd).toBe(report.records.reduce((total, record) => total + record.chargedCostMicroUsd, 0));
    expect(report.stopReason).toBeNull();
    expect(report.skippedSteps).toBe(0);
    // Output limits from the prompt definitions reach the provider.
    expect(calls[2]?.maxOutputTokens).toBe(detailsPrompt.maxOutputTokens);
  });
});

describe('runStage: fail-closed accounting', () => {
  it('aborts before any call when a model has no recorded price', async () => {
    const { provider, calls } = stubProvider();
    await expect(runStage('smoke', { ...config, fastModels: ['gpt-unpriced'] }, { provider })).rejects.toThrow(UnknownModelPriceError);
    expect(calls).toHaveLength(0);
  });

  it('charges the estimate and stops when usage is unknown', async () => {
    const { provider, calls } = stubProvider(() => ({ kind: 'error', error: 'timeout', usage: null, latencyMs: 10_000, httpStatus: null }));
    const report = await runStage('smoke', config, { provider });
    expect(calls).toHaveLength(1);
    expect(report.stopReason).toBe('usage_unknown');
    expect(report.skippedSteps).toBe(2);
    expect(report.records[0]).toMatchObject({ accounting: 'estimate', chargedCostMicroUsd: firstLookupEstimate() });
    expect(report.spentMicroUsd).toBe(firstLookupEstimate());
  });

  it('does not start a call whose estimate would exceed the cap', async () => {
    const { provider, calls } = stubProvider();
    const report = await runStage('smoke', { ...config, capMicroUsd: firstLookupEstimate() - 1 }, { provider });
    expect(calls).toHaveLength(0);
    expect(report).toMatchObject({ stopReason: 'cap_reached', skippedSteps: 3, spentMicroUsd: 0 });
  });

  it('stops when the actual cost exceeds the estimate (estimates no longer trustworthy)', async () => {
    const huge: ProviderUsage = { inputTokens: 5_000_000, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
    const { provider, calls } = stubProvider((request, input) => ({ kind: 'ok', output: validOutput(request, input), usage: huge, latencyMs: 5 }));
    const report = await runStage('smoke', { ...config, capMicroUsd: 3_000_000 }, { provider });
    expect(calls).toHaveLength(1);
    expect(report.stopReason).toBe('actual_cost_exceeded_estimate');
  });

  it('stops on account-level provider errors even when usage is known', async () => {
    const zero: ProviderUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
    const { provider, calls } = stubProvider(() => ({ kind: 'error', error: 'insufficient_quota', usage: zero, latencyMs: 5, httpStatus: 429 }));
    const report = await runStage('smoke', config, { provider });
    expect(calls).toHaveLength(1);
    expect(report.stopReason).toBe('provider_insufficient_quota');
  });

  it('records billed but invalid output as a failure and keeps going', async () => {
    const { provider, calls } = stubProvider(request => (request.schemaName === 'polish_lookup'
      ? { kind: 'error', error: 'invalid_output', usage, latencyMs: 5, httpStatus: null }
      : 'valid'));
    const report = await runStage('smoke', config, { provider });
    expect(calls).toHaveLength(3);
    expect(report.records[0]).toMatchObject({ status: 'provider_error', errorKind: 'invalid_output', accounting: 'actual' });
    expect(report.scores[0]?.score.ok).toBe(false);
  });
});

// Regression (review finding 2): partial results survive unexpected exceptions.
describe('runStage: unexpected exceptions after paid calls', () => {
  function sequenceProvider(handlers: readonly ((request: ProviderRequest<unknown>, input: Record<string, unknown>) => ProviderResult<unknown>)[]) {
    let call = 0;
    const provider: LlmProvider = {
      id: 'sequence',
      async complete<T>(request: ProviderRequest<T>): Promise<ProviderResult<T>> {
        const handler = handlers[call++];
        if (!handler) throw new Error('no more responses');
        const result = handler(request, JSON.parse(request.input) as Record<string, unknown>);
        // Object.assign (not spread) keeps accessor properties of the handler's result intact.
        return (result.kind === 'ok' ? Object.assign(result, { output: request.schema.parse(result.output) }) : result) as ProviderResult<T>;
      },
    };
    return provider;
  }
  const ok = (request: ProviderRequest<unknown>, input: Record<string, unknown>): ProviderResult<unknown> =>
    ({ kind: 'ok', output: validOutput(request, input), usage, latencyMs: 5 });

  it('records a provider exception as a charged call and stops instead of losing the report', async () => {
    const provider = sequenceProvider([ok, () => {
      throw new TypeError('provider bug');
    }]);
    const report = await runStage('smoke', config, { provider });
    expect(report.records.map(record => [record.status, record.accounting])).toEqual([['ok', 'actual'], ['provider_error', 'estimate']]);
    expect(report.stopReason).toBe('provider_exception:TypeError');
    expect(report.skippedSteps).toBe(1);
    expect(report.spentMicroUsd).toBe(report.records.reduce((total, record) => total + record.chargedCostMicroUsd, 0));
  });

  it('records a refine exception as a failed call with its actual cost', async () => {
    const throwingRefine = { ...lookupPrompt, refine: () => {
      throw new RangeError('refine bug');
    } };
    const { executeCall } = await import('./call');
    const { provider } = stubProvider();
    const budget = createEvalBudget(1_000_000);
    const { record } = await executeCall({ provider, budget }, {
      callId: 'x', prompt: throwingRefine, input: { key: 'psa', language: 'ru' }, model: FAST, variant: 'combined', repetition: 1, subject: 'noun-psa', language: 'ru',
    });
    expect(record).toMatchObject({ status: 'refine_failed', refineReason: 'exception:RangeError', accounting: 'actual' });
    expect(budget.spentMicroUsd()).toBe(record.chargedCostMicroUsd);
  });

  it('returns the completed calls and the full spend when the run aborts unexpectedly', async () => {
    const broken = (request: ProviderRequest<unknown>, input: Record<string, unknown>): ProviderResult<unknown> => {
      const result = { kind: 'ok', output: validOutput(request, input), usage } as const;
      // A malformed result whose field access throws outside the call's own guards.
      return Object.defineProperty({ ...result }, 'latencyMs', { get: () => {
        throw new SyntaxError('malformed result');
      } }) as ProviderResult<unknown>;
    };
    const report = await runStage('smoke', config, { provider: sequenceProvider([ok, broken]) });
    expect(report.abortReason).toBe('unexpected_error:SyntaxError');
    expect(report.records).toHaveLength(1);
    expect(report.skippedSteps).toBe(2);
    // The aborted call was billed and charged: spend covers more than the recorded calls.
    expect(report.spentMicroUsd).toBeGreaterThan(report.records[0]?.chargedCostMicroUsd ?? 0);
  });
});

// Regression (review finding 4): expected vs. completed cases per model and variant.
describe('runStage: completeness', () => {
  const twoFast = { fastModels: [FAST, 'gpt-6.1-terra'], detailModels: [DETAIL], capMicroUsd: 1_000_000 };

  it('passes run_complete only when every planned case ran', async () => {
    const { provider } = stubProvider();
    const report = await runStage('pilot', twoFast, { provider });
    expect(report.lookupMetrics.map(entry => [entry.model, entry.completeness.value])).toEqual([[FAST, 1], ['gpt-6.1-terra', 1]]);
    expect(report.lookupMetrics.every(entry => entry.gates.find(gate => gate.name === 'run_complete')?.passed)).toBe(true);
  });

  it('fails run_complete for a capped run, including models that never ran', async () => {
    const { provider } = stubProvider();
    const report = await runStage('pilot', { ...twoFast, capMicroUsd: 3 * firstLookupEstimate() }, { provider });
    expect(report.stopReason).toBe('cap_reached');
    const byModel = new Map(report.lookupMetrics.map(entry => [entry.model, entry]));
    expect(byModel.get(FAST)?.completeness).toMatchObject({ denominator: PILOT_ITEM_IDS.length });
    expect(byModel.get(FAST)?.completeness.value).toBeLessThan(1);
    expect(byModel.get('gpt-6.1-terra')?.completeness).toMatchObject({ numerator: 0, denominator: PILOT_ITEM_IDS.length });
    for (const entry of report.lookupMetrics) {
      expect(entry.gates.find(gate => gate.name === 'run_complete')?.passed).toBe(false);
    }
  });
});

describe('createEvalBudget', () => {
  it('authorizes only while spent + estimate stays within the cap, then stays stopped', () => {
    const budget = createEvalBudget(100);
    budget.authorize(60);
    budget.settle(60);
    budget.authorize(40);
    expect(() => budget.authorize(41)).toThrow(EvalStop);
    expect(budget.stopReason()).toBe('cap_reached');
    expect(() => budget.authorize(0)).toThrow(EvalStop);
  });

  it('keeps the first stop reason', () => {
    const budget = createEvalBudget(100);
    budget.stop('usage_unknown');
    budget.stop('provider_auth');
    expect(budget.stopReason()).toBe('usage_unknown');
  });

  it('rejects invalid caps and charges', () => {
    expect(() => createEvalBudget(0)).toThrow(RangeError);
    expect(() => createEvalBudget(100).settle(-1)).toThrow(RangeError);
  });
});

describe('planStage', () => {
  it('smoke is exactly three calls: lookup, short translation, details', () => {
    expect(planStage('smoke', config).map(step => step.type)).toEqual(['lookup', 'translation', 'details']);
  });

  it('pilot runs 10 to 15 words per fast model plus two details per detail model', () => {
    const plan = planStage('pilot', { fastModels: [FAST, 'gpt-6.1-terra'], detailModels: [DETAIL] });
    expect(PILOT_ITEM_IDS.length).toBeGreaterThanOrEqual(10);
    expect(PILOT_ITEM_IDS.length).toBeLessThanOrEqual(15);
    expect(plan.filter(step => step.type === 'lookup')).toHaveLength(PILOT_ITEM_IDS.length * 2);
    expect(plan.filter(step => step.type === 'details')).toHaveLength(2);
  });

  it('full never sends locally rejected items and repeats lookups twice', () => {
    const plan = planStage('full', config);
    const lookups = plan.filter(step => step.type === 'lookup');
    expect(lookups).toHaveLength(llmBoundItems.length * 2);
    expect(plan.some(step => (step.type === 'lookup' || step.type === 'split') && step.item.localReject)).toBe(false);
  });
});
