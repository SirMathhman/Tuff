import { type EvaluateError, type EvaluateResult } from "./errors.js";
import { tokenize } from "./tokenize.js";
import { Parser } from "./parser.js";

export type { EvaluateError, EvaluateResult } from "./errors.js";

/**
 * Evaluates a Tuff expression.
 *
 * Supports addition, subtraction, and multiplication, as well as
 * parentheses or curly braces for grouping. `let` statements (optionally
 * `let mut` for mutable bindings) and assignment statements (`x = expr;`)
 * may appear at the top level and inside curly-brace blocks, each
 * followed by a final expression, e.g.
 * `let y = { let x = 2 + 3; x } * 4; y`; variables are only visible
 * inside the block (or top level) that declares them, and only `mut`
 * bindings may be assigned. References are created with `&x` (shared)
 * or `&mut x` (mutable, requires a `mut` binding) and read with the
 * prefix `*` operator; `*y = expr;` writes through a mutable reference.
 * Multiplication binds tighter than addition and subtraction, which are
 * evaluated left to right. Empty input is a defined case and evaluates
 * to 0.
 */
export function evaluate(input: string): EvaluateResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  const tokens = tokenize(trimmed);
  if (tokens === null) {
    return {
      ok: false,
      error: {
        kind: "invalid-number",
        input,
        reason: `Cannot parse "${input}" as a number`,
      },
    };
  }

  const parser = new Parser(tokens);
  const value = parser.parseProgram();
  const error = parserError(parser, input);
  if (error !== null) {
    return { ok: false, error };
  }
  if (value === null || !parser.atEnd()) {
    return {
      ok: false,
      error: {
        kind: "malformed-expression",
        input,
        reason: `Unexpected end of expression in "${input}"`,
      },
    };
  }
  return { ok: true, value };
}

/**
 * Builds the structured error for a variable-related parse failure, or
 * null when the parser did not record one.
 */
function parserError(parser: Parser, input: string): EvaluateError | null {
  if (parser.unknownVariable !== null) {
    return {
      kind: "unknown-variable",
      input,
      name: parser.unknownVariable,
      reason: `Unknown variable "${parser.unknownVariable}" in "${input}"`,
    };
  }
  if (parser.immutableVariable !== null) {
    return {
      kind: "immutable-assignment",
      input,
      name: parser.immutableVariable,
      reason: `Cannot assign to immutable variable "${parser.immutableVariable}" in "${input}"`,
    };
  }
  if (parser.invalidDereference !== null) {
    return {
      kind: "invalid-dereference",
      input,
      name: parser.invalidDereference,
      reason: `Cannot dereference non-reference "${parser.invalidDereference}" in "${input}"`,
    };
  }
  return null;
}
