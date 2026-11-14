// Application-level spending guard for the live evaluation.
//
// The cap is a CONSERVATIVE ESTIMATE, not a guaranteed hard limit: it relies on
// the recorded price table and on the provider honoring max_output_tokens. The
// real hard cap is the provider-side budget (DECISIONS OD-09). The guard:
// - authorizes a call only if spent + worst-case estimate <= cap
// - charges the provider-reported cost, or the worst-case estimate when usage is unknown
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
