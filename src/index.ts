import { evaluateExpression, type EvalErrorReason } from "./evaluator.ts";

export enum TuffErrorReason {
  EmptySource = "EmptySource",
  NotANumber = "NotANumber",
  InvalidExpression = "InvalidExpression",
}

export interface TuffError {
  readonly reason: TuffErrorReason;
  readonly source: string;
  /**
   * 0-based index of the offending character in `source`, or -1 when the
   * failure is not tied to a specific character (e.g. empty source).
   */
  readonly position: number;
}

export interface TuffSuccess {
  readonly ok: true;
  readonly value: number;
}

export interface TuffFailure {
  readonly ok: false;
  readonly error: TuffError;
}

export type TuffResult = TuffSuccess | TuffFailure;

const evaluatorReason: Record<EvalErrorReason, TuffErrorReason> = {
  NotANumber: TuffErrorReason.NotANumber,
  InvalidExpression: TuffErrorReason.InvalidExpression,
};

export function evaluateTuff(tuffSource: string): TuffResult {
  const trimmed = tuffSource.trim();
  if (trimmed === "") {
    return {
      ok: false,
      error: {
        reason: TuffErrorReason.EmptySource,
        source: tuffSource,
        position: -1,
      },
    };
  }
  const outcome = evaluateExpression(trimmed);
  if (!outcome.ok) {
    return {
      ok: false,
      error: {
        reason: evaluatorReason[outcome.reason],
        source: tuffSource,
        position: outcome.position,
      },
    };
  }
  return { ok: true, value: outcome.value };
}
