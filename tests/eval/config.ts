import { z } from 'zod';
import { usdToMicroUsd } from '../../server/core/modules/llm/index';

export const stageNames = ['smoke', 'pilot', 'full'] as const;
export type StageName = typeof stageNames[number];

/** Maximum application-level cap per stage (USD). LLM_EVAL_CAP_USD can only lower it. */
export const STAGE_MAX_CAP_USD: Readonly<Record<StageName, number>> = { smoke: 0.25, pilot: 1, full: 3 };

export type EvalConfig = Readonly<{
  stage: StageName;
  apiKey: string;
  fastModels: readonly string[];
  detailModels: readonly string[];
  capMicroUsd: number;
  outputDir: string;
}>;

/**
 * Live calls are disabled by default. A stage runs only when LLM_EVAL_LIVE
 * names exactly that stage (e.g. LLM_EVAL_LIVE=smoke), so authorizing one stage
 * never authorizes another.
 */
export function isStageAuthorized(stage: StageName, env: Readonly<Record<string, string | undefined>>): boolean {
  return env.LLM_EVAL_LIVE === stage;
}

const modelList = z.string()
  .transform(value => value.split(',').map(entry => entry.trim()).filter(entry => entry !== ''))
  .pipe(z.array(z.string().regex(/^[\w.:-]{1,64}$/u, 'model ids may contain letters, digits, ".", ":", "_", "-"')).min(1, 'at least one model is required').max(3, 'at most 3 models'));

const envSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1, 'is required'),
  LLM_EVAL_FAST_MODELS: modelList,
  LLM_EVAL_DETAIL_MODELS: modelList,
  LLM_EVAL_CAP_USD: z.coerce.number().positive().optional(),
  LLM_EVAL_OUTPUT_DIR: z.string().trim().min(1).default('eval-results'),
});

export class EvalConfigError extends Error {
  override readonly name = 'EvalConfigError';
}

/** Error messages name variables, never their values (the key is a secret). */
export function parseEvalConfig(stage: StageName, env: Readonly<Record<string, string | undefined>>): EvalConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    throw new EvalConfigError(`Invalid evaluation configuration. ${details}`);
  }
  const maxCap = STAGE_MAX_CAP_USD[stage];
  const capUsd = Math.min(result.data.LLM_EVAL_CAP_USD ?? maxCap, maxCap);
  return {
    stage,
    apiKey: result.data.OPENAI_API_KEY,
    fastModels: result.data.LLM_EVAL_FAST_MODELS,
    detailModels: result.data.LLM_EVAL_DETAIL_MODELS,
    capMicroUsd: usdToMicroUsd(capUsd),
    outputDir: result.data.LLM_EVAL_OUTPUT_DIR,
  };
}
