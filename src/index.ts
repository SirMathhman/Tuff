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
 * followed by an optional final expression (a program with no final
 * expression evaluates to 0), e.g.
 * `let y = { let x = 2 + 3; x } * 4; y`; variables are only visible
 * inside the block (or top level) that declares them, and only `mut`
 * bindings may be assigned. References are created with `&x` (shared)
 * or `&mut x` (mutable, requires a `mut` binding) and read with the
 * prefix `*` operator; `*y = expr;` writes through a mutable reference.
 * The boolean literals `true` and `false` evaluate to 1 and 0 and are
 * reserved words. A binding remembers the kind of literal it was
 * initialized with, and assigning a literal of the other kind (a boolean
 * to a number-initialized binding, or a number to a boolean-initialized
 * one) is a `type-mismatch` error; non-literal right-hand sides never
 * mismatch. Assigning a value to a reference binding (`y = expr;` where
 * `y` is a reference) is a `reference-assignment` error. The if
 * expression `if (cond) then else other` evaluates the parenthesized
 * condition and yields the then branch when it is non-zero, otherwise
 * the else branch; `if` and `else` are reserved words. Multiplication
 * binds tighter than addition and subtraction, which are evaluated left
 * to right. Empty input is a defined case and evaluates to 0.
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
  if (error.kind === "type-mismatch") {
    return {
      kind: "type-mismatch",
      input,
      name: error.name,
      reason: `Cannot assign ${error.from} literal to ${error.to} variable "${error.name}" in "${input}"`,
    };
  }
  return {
    kind: error.kind,
    input,
    name: error.name,
    reason: reasonFor(error.kind, error.name, input),
  };
}

/**
 * Builds the human-readable reason for a name-based parse error.
 */
function reasonFor(
  kind:
    | "unknown-variable"
    | "immutable-assignment"
    | "invalid-dereference"
    | "reference-as-value"
    | "reference-assignment",
  name: string,
  input: string,
): string {
  switch (kind) {
    case "unknown-variable":
      return `Unknown variable "${name}" in "${input}"`;
    case "immutable-assignment":
      return `Cannot assign to immutable variable "${name}" in "${input}"`;
    case "invalid-dereference":
      return `Cannot dereference non-reference "${name}" in "${input}"`;
    case "reference-as-value":
      return `Cannot use reference "${name}" as a value in "${input}"`;
    case "reference-assignment":
      return `Cannot assign value to reference "${name}" in "${input}"`;
  }
}
