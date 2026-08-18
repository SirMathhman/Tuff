export enum TuffErrorReason {
  EmptySource = "EmptySource",
  NotANumber = "NotANumber",
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
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      error: { reason: TuffErrorReason.NotANumber, source: tuffSource },
    };
  }
  return { ok: true, value };
}
