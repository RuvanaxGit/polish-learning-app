import {
  costMicroUsd,
  estimatedCostMicroUsd,
  estimateRequest,
  priceForModel,
} from '../../server/core/modules/llm/index';
import type {
  LlmFeature,
  LlmProvider,
  PromptDefinition,
  ProviderErrorKind,
  ProviderUsage,
  RequestEstimate,
} from '../../server/core/modules/llm/index';
import type { EvalBudget } from './budget';

export type CallStatus = 'ok' | 'refusal' | 'provider_error' | 'schema_invalid' | 'refine_failed';

export type CallRecord = Readonly<{
  callId: string;
  feature: LlmFeature;
  promptVersion: string;
  model: string;
  variant: string;
  repetition: number;
  /** Golden item id or lexeme, never user data. */
  subject: string;
  language: string | null;
  status: CallStatus;
  errorKind: ProviderErrorKind | null;
  refineReason: string | null;
  warnings: readonly string[];
  usage: ProviderUsage | null;
  estimate: RequestEstimate;
  estimatedCostMicroUsd: number;
  chargedCostMicroUsd: number;
  /** `estimate` = usage unknown, the worst case was charged. */
  accounting: 'actual' | 'estimate';
  latencyMs: number;
  /** Refined output when `status === 'ok'`. */
  output: unknown;
}>;

export type CallSpec<I, O> = Readonly<{
  callId: string;
  prompt: PromptDefinition<I, O>;
  input: I;
  model: string;
  variant: string;
  repetition: number;
  subject: string;
  language: string | null;
}>;

// Configuration or account problems: every further call would fail the same way.
const STOPPING_ERRORS: readonly ProviderErrorKind[] = ['insufficient_quota', 'auth', 'bad_request'];

/**
 * One accounted provider call. Pre-call: price lookup (throws for unknown
 * models), worst-case estimate, budget authorization (throws EvalStop).
 * Post-call: charge actual cost, or the estimate when usage is unknown, and
 * stop the budget whenever accounting is uncertain.
 */
export async function executeCall<I, O>(
  deps: Readonly<{ provider: LlmProvider; budget: EvalBudget }>,
  spec: CallSpec<I, O>,
): Promise<Readonly<{ record: CallRecord; value: O | null }>> {
  const { prompt } = spec;
  const price = priceForModel(spec.model);
  const modelInput = prompt.toModelInput(spec.input);
  const estimate = estimateRequest({ instructions: prompt.instructions, input: modelInput, schema: prompt.schema, maxOutputTokens: prompt.maxOutputTokens });
  const estimatedCost = estimatedCostMicroUsd(estimate, price);

  deps.budget.authorize(estimatedCost);
  const result = await deps.provider.complete({
    model: spec.model,
    instructions: prompt.instructions,
    input: modelInput,
    schema: prompt.schema,
    schemaName: prompt.schemaName,
    maxOutputTokens: prompt.maxOutputTokens,
    timeoutMs: prompt.timeoutMs,
  });

  const charged = result.usage ? costMicroUsd(result.usage, price) : estimatedCost;
  deps.budget.settle(charged);
  if (!result.usage) deps.budget.stop('usage_unknown');
  else if (charged > estimatedCost) deps.budget.stop('actual_cost_exceeded_estimate');
  if (result.kind === 'error' && STOPPING_ERRORS.includes(result.error)) deps.budget.stop(`provider_${result.error}`);

  let status: CallStatus;
  let value: O | null = null;
  let refineReason: string | null = null;
  let warnings: readonly string[] = [];

  if (result.kind === 'error') status = 'provider_error';
  else if (result.kind === 'refusal') status = 'refusal';
  else {
    // Defense in depth: validate again even though the adapter already did.
    const parsed = prompt.schema.safeParse(result.output);
    if (!parsed.success) status = 'schema_invalid';
    else {
      const refined = prompt.refine(parsed.data, spec.input);
      warnings = refined.warnings;
      if (refined.ok) {
        status = 'ok';
        value = refined.value;
      }
      else {
        status = 'refine_failed';
        refineReason = refined.reason;
      }
    }
  }

  return {
    value,
    record: {
      callId: spec.callId,
      feature: prompt.feature,
      promptVersion: prompt.version,
      model: spec.model,
      variant: spec.variant,
      repetition: spec.repetition,
      subject: spec.subject,
      language: spec.language,
      status,
      errorKind: result.kind === 'error' ? result.error : null,
      refineReason,
      warnings,
      usage: result.usage,
      estimate,
      estimatedCostMicroUsd: estimatedCost,
      chargedCostMicroUsd: charged,
      accounting: result.usage ? 'actual' : 'estimate',
      latencyMs: result.latencyMs,
      output: value,
    },
  };
}
