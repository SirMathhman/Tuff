/**
 * Evaluates a Tuff expression string and returns its numeric value.
 *
 * An empty (or whitespace-only) input evaluates to 0.
 *
 * Supports integers and decimals, the operators `+`, `-`, `*`, `/`,
 * unary `+`/`-`, and parentheses or braces as grouping delimiters,
 * honoring standard operator precedence.
 *
 * Braces may also introduce a block: zero or more `let x = <expr>;`
 * bindings followed by a final expression whose value is the block's
 * value. Bound variables can be referenced by name in later expressions.
 *
 * Malformed input does not throw; it returns a structured error via
 * `Result<number, TuffError>`.
 */
import type { Result, TuffError } from "./errors.js";
import { tokenize } from "./lexer.js";
import { parseExpression } from "./parser.js";

export type { Result, SourcePosition, TuffError } from "./errors.js";
export type { Token } from "./lexer.js";

export function evaluate(input: string): Result<number, TuffError> {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }
  const tokens = tokenize(trimmed);
  if (!tokens.ok) {
    return tokens;
  }
  return parseExpression(tokens.value);
}
