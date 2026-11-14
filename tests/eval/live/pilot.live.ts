import { describe, expect, it } from 'vitest';
import { isStageAuthorized, parseEvalConfig } from '../config';
import { runLiveStage } from './run-live-stage';

// Stage 2: pilot on 12 golden words (+2 details), PAID. Skipped unless LLM_EVAL_LIVE=pilot.
// Accuracy is reported, not asserted: the pilot informs prompt and model choices.
describe.skipIf(!isStageAuthorized('pilot', process.env))('live evaluation: pilot (paid)', () => {
  it('runs within the application-level cost cap', async () => {
    const { report } = await runLiveStage(parseEvalConfig('pilot', process.env));
    expect(report.abortReason).toBeNull();
    expect(report.spentMicroUsd).toBeLessThanOrEqual(report.capMicroUsd);
  }, 20 * 60_000);
});
