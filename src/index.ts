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
 *          override precedence.
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

  const ast = parse(tokens.value, input);
  if (!ast.ok) {
    return ast;
  }

  return { ok: true, value: evaluateAst(ast.value) };
}
