import { evaluateAst } from "./evaluator.js";
import type { TuffError } from "./errors.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import type { Result } from "./result.js";

/**
 * Evaluates a Tuff expression.
 *
 * @param input - The expression to evaluate.
 * @returns A Result holding the numeric value, or a structured error.
 *          An empty (or whitespace-only) expression evaluates to 0.
 *          Numeric literals and binary `+`/`-`/`*` expressions are supported,
 *          with `*` binding tighter than `+`/`-`. Parentheses or braces
 *          override precedence. `let` bindings are supported:
 *          `let [mut] x = expr; stmt; ...` where each statement is an
 *          expression or an assignment (`x = expr`, only for `mut`
 *          bindings). A top-level binding with no statements evaluates
 *          to 0. Braces form block expressions: `{ stmt; ... }`
 *          evaluates to the value of its last statement.
 */
export function evaluate(input: string): Result<number, TuffError> {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  const tokens = lex(trimmed);
  if (!tokens.ok) {
    return tokens;
  }

  // Positions are measured against the trimmed string, so carry it into
  // errors to keep `position` and `input` consistent.
  const ast = parse(tokens.value, trimmed);
  if (!ast.ok) {
    return ast;
  }

  const value = evaluateAst(ast.value, trimmed);
  if (!value.ok) {
    return value;
  }

  return { ok: true, value: value.value };
}
