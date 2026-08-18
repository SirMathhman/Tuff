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

const NUMBER_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export function evaluate(input: string): Result<number, EvaluateError> {
  if (input === "") {
    return { ok: true, value: 0 };
  }
  if (NUMBER_PATTERN.test(input)) {
    return { ok: true, value: Number(input) };
  }
  return {
    ok: false,
    error: {
      kind: EvaluateErrorKind.UnsupportedInput,
      input,
      message:
        `evaluate() does not support input (got ${JSON.stringify(input)}). ` +
        "Only the empty string and numeric literals are implemented. " +
        "Provide a spec for the expression grammar to extend this.",
    },
  };
}
