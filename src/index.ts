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

function unsupported(input: string): Result<number, EvaluateError> {
  return {
    ok: false,
    error: {
      kind: EvaluateErrorKind.UnsupportedInput,
      input,
      message:
        `evaluate() does not support input (got ${JSON.stringify(input)}). ` +
        "Only the empty string, numeric literals, and addition of numeric literals are implemented. " +
        "Provide a spec for the expression grammar to extend this.",
    },
  };
}

export function evaluate(input: string): Result<number, EvaluateError> {
  if (input === "") {
    return { ok: true, value: 0 };
  }
  if (NUMBER_PATTERN.test(input)) {
    return { ok: true, value: Number(input) };
  }
  const terms = input.split(/\s*\+\s*/);
  if (terms.length > 1 && terms.every((t) => NUMBER_PATTERN.test(t))) {
    return { ok: true, value: terms.reduce((sum, t) => sum + Number(t), 0) };
  }
  return unsupported(input);
}
