export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export enum EvaluateErrorKind {
  UnsupportedInput = "UnsupportedInput",
}

export interface EvaluateError {
  kind: EvaluateErrorKind;
  input: string;
  message: string;
}

export function evaluate(input: string): Result<number, EvaluateError> {
  if (input === "") {
    return { ok: true, value: 0 };
  }
  return {
    ok: false,
    error: {
      kind: EvaluateErrorKind.UnsupportedInput,
      input,
      message:
        `evaluate() does not yet support non-empty input (got ${JSON.stringify(input)}). ` +
        "Only the empty string is implemented. " +
        "Provide a spec for the expression grammar to extend this.",
    },
  };
}
