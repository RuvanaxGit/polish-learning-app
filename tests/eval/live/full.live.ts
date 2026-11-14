import { describe, expect, it } from 'vitest';
import { isStageAuthorized, parseEvalConfig } from '../config';
import { runLiveStage } from './run-live-stage';

// Stage 3: full evaluation, PAID (cap $3, application-level estimate).
// Requires explicit owner approval after the pilot; skipped unless LLM_EVAL_LIVE=full.
describe.skipIf(!isStageAuthorized('full', process.env))('live evaluation: full (paid)', () => {
  it('runs within the application-level cost cap', async () => {
    const { report } = await runLiveStage(parseEvalConfig('full', process.env));
    expect(report.abortReason).toBeNull();
    expect(report.spentMicroUsd).toBeLessThanOrEqual(report.capMicroUsd);
  }, 60 * 60_000);
});
