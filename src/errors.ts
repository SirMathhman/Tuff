export const EvaluateErrorKind = {
  EmptyInput: "EmptyInput",
  EvaluationFailed: "EvaluationFailed",
} as const;

export type EvaluateErrorKind = (typeof EvaluateErrorKind)[keyof typeof EvaluateErrorKind];

export type EvaluateError = {
  kind: EvaluateErrorKind;
  cause?: unknown;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: EvaluateError };
