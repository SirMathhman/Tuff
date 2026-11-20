import { tokenize } from "./src/lexer.ts";
import { parseProgram } from "./src/parser.ts";
import { resolve } from "./src/resolver.ts";
import { evaluate } from "./src/evaluator.ts";
import type { TuffError } from "./src/errors.ts";
import type { Result } from "./src/result.ts";

export type { Span } from "./src/span.ts";
export { TuffErrorKind, describeError } from "./src/errors.ts";
export type { TuffError, TuffErrorOf, ErrorExplanation } from "./src/errors.ts";
export type { Ok, Err, Result } from "./src/result.ts";

/**
 * Evaluates Tuff source text: tokenize, parse, resolve names, then evaluate.
 * Errors are reported in phase order; the first failing phase wins.
 *
 * @param source - The Tuff source to evaluate.
 * @returns The numeric value, or the first `TuffError` found.
 */
export function evaluateTuff(source: string): Result<number, TuffError> {
  const tokenized = tokenize(source);
  if (!tokenized.ok) return tokenized;
  const program = parseProgram(tokenized.value, { start: source.length, end: source.length });
  if (!program.ok) return program;
  const resolved = resolve(program.value);
  if (!resolved.ok) return resolved;
  return evaluate(program.value, resolved.value);
}
