import { type EvaluateError, type EvaluateResult, type ParseError } from "./errors.js";
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
 * The boolean literals `true` and `false` evaluate to 1 and 0 and are
 * reserved words. Multiplication binds tighter than addition and
 * subtraction, which are evaluated left to right. Empty input is a
 * defined case and evaluates to 0.
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

  const parsed = new Parser(tokens).parseProgram();
  if (!parsed.ok) {
    return { ok: false, error: toEvaluateError(parsed.error, input) };
  }
  return { ok: true, value: parsed.value };
}

/**
 * Maps a parse failure to the structured `EvaluateError` for the input.
 */
function toEvaluateError(error: ParseError, input: string): EvaluateError {
  if (error.kind === "malformed-expression") {
    return {
      kind: "malformed-expression",
      input,
      reason: `Unexpected end of expression in "${input}"`,
    };
  }
  if (error.kind === "unknown-variable") {
    return {
      kind: "unknown-variable",
      input,
      name: error.name,
      reason: `Unknown variable "${error.name}" in "${input}"`,
    };
  }
  if (error.kind === "immutable-assignment") {
    return {
      kind: "immutable-assignment",
      input,
      name: error.name,
      reason: `Cannot assign to immutable variable "${error.name}" in "${input}"`,
    };
  }
  return {
    kind: "invalid-dereference",
    input,
    name: error.name,
    reason: `Cannot dereference non-reference "${error.name}" in "${input}"`,
  };
}
