import { evaluateExpression } from "./evaluator.ts";

export enum TuffErrorReason {
  EmptySource = "EmptySource",
  NotANumber = "NotANumber",
  InvalidExpression = "InvalidExpression",
}

export interface TuffError {
  readonly reason: TuffErrorReason;
  readonly source: string;
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

export function evaluateTuff(tuffSource: string): TuffResult {
  const trimmed = tuffSource.trim();
  if (trimmed === "") {
    return {
      ok: false,
      error: { reason: TuffErrorReason.EmptySource, source: tuffSource },
    };
  }
  const outcome = evaluateExpression(trimmed);
  if (!outcome.ok) {
    return {
      ok: false,
      error: { reason: TuffErrorReason[outcome.reason], source: tuffSource },
    };
  }
  return { ok: true, value: outcome.value };
}
