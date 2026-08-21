import type { Span } from "./ast.ts";

export type EvalError =
  | {
      kind: "invalid_input";
      input: string;
      reason: string;
      hint: string;
      span: Span;
    }
  | {
      kind: "division_by_zero";
      input: string;
      reason: string;
      hint: string;
      span: Span;
    };

export function invalidInput(
  input: string,
  reason: string,
  span: Span,
): EvalError {
  return {
    kind: "invalid_input",
    input,
    reason,
    hint: 'pass a valid arithmetic expression, e.g. "1 + 2 * 3"',
    span,
  };
}

export function divisionByZero(
  input: string,
  reason: string,
  span: Span,
): EvalError {
  return {
    kind: "division_by_zero",
    input,
    reason,
    hint: "the divisor evaluates to 0; check the right-hand side of /",
    span,
  };
}
