import { describe, expect, it } from 'vitest';
import { isStageAuthorized, parseEvalConfig } from '../config';
import { runLiveStage } from './run-live-stage';

// Stage 1: Structured Outputs compatibility smoke test, 3 PAID calls
// (lookup, short_translation, details). Skipped unless LLM_EVAL_LIVE=smoke.
describe.skipIf(!isStageAuthorized('smoke', process.env))('live evaluation: smoke (paid)', () => {
  it('every prompt round-trips through Structured Outputs with known usage', async () => {
    const { report } = await runLiveStage(parseEvalConfig('smoke', process.env));
    expect(report.stopReason).toBeNull();
    expect(report.records.map(record => [record.feature, record.status, record.accounting])).toEqual([
      ['lookup', 'ok', 'actual'],
      ['short_translation', 'ok', 'actual'],
      ['details', 'ok', 'actual'],
    ]);
  }, 5 * 60_000);
});
