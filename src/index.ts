import { evalProgram } from "./evaluator.js";
import type { EvalError, Result } from "./errors.js";
import { tokenize } from "./lexer.js";
import { parse } from "./parser/index.js";

/**
 * Evaluate a program of `let`/`let mut` declarations, assignments, `return` statements,
 * and `{ ... }` blocks.
 * @param expression - The program to evaluate.
 * @returns A `Result` carrying the numeric result, or a structured `EvalError`.
 */
export function evaluate(expression: string): Result<number, EvalError> {
  const tokens = tokenize(expression);
  if (!tokens.ok) {
    return tokens;
  }
  const program = parse(tokens.value, expression);
  if (!program.ok) {
    return program;
  }
  return evalProgram(program.value);
}
