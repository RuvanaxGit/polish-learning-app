// Application-level spending guard for the live evaluation.
//
// The cap is NOT a hard spending limit. Limitations:
// - The input estimate is a heuristic (estimateRequest), not an upper bound,
//   and the price table may be stale. A call that costs more than estimated
//   is detected only after it has been billed; the guard then stops, so the
//   cap can be exceeded by that one call's excess.
// - When usage is unknown (timeout, network error) the estimate is charged,
//   but the provider may have billed more (or less).
// - The cap applies PER EXECUTION. Every run starts at zero; repeated runs
//   are not summed. The cumulative limit is the provider-side project budget
//   (DECISIONS OD-09), and each run's spend is recorded in its report.
// The guard:
// - authorizes a call only if spent + estimate <= cap
// - charges the provider-reported cost, or the estimate when usage is unknown
// - stops (fail-closed) once accounting becomes uncertain

export class EvalStop extends Error {
  override readonly name = 'EvalStop';

  constructor(readonly reason: string) {
    super(`Evaluation stopped: ${reason}`);
  }
}

export type EvalBudget = Readonly<{
  capMicroUsd: number;
  spentMicroUsd: () => number;
  stopReason: () => string | null;
  /** Throws EvalStop if stopped, or if this call could push spending past the cap. */
  authorize: (estimatedCostMicroUsd: number) => void;
  settle: (chargedMicroUsd: number) => void;
  /** Blocks every further call. The first reason is kept. */
  stop: (reason: string) => void;
}>;

export function createEvalBudget(capMicroUsd: number): EvalBudget {
  if (!Number.isSafeInteger(capMicroUsd) || capMicroUsd <= 0) throw new RangeError('Budget cap must be a positive integer (micro-USD)');
  let spent = 0;
  let stopReason: string | null = null;

  return {
    capMicroUsd,
    spentMicroUsd: () => spent,
    stopReason: () => stopReason,
    authorize(estimatedCostMicroUsd) {
      if (stopReason !== null) throw new EvalStop(stopReason);
      if (spent + estimatedCostMicroUsd > capMicroUsd) {
        stopReason = 'cap_reached';
        throw new EvalStop(stopReason);
      }
    },
    settle(chargedMicroUsd) {
      if (!Number.isSafeInteger(chargedMicroUsd) || chargedMicroUsd < 0) throw new RangeError('Charge must be a non-negative integer');
      spent += chargedMicroUsd;
    },
    stop(reason) {
      stopReason ??= reason;
    },
  };
}
