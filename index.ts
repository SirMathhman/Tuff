import { tokenize } from "./src/lexer.ts";
import { parseProgram } from "./src/parser.ts";
import { resolve } from "./src/resolver.ts";
import { evaluate } from "./src/evaluator.ts";
import type { TuffError } from "./src/errors.ts";
import type { Result } from "./src/result.ts";

export type { Span } from "./src/span.ts";
export { TuffErrorKind } from "./src/errors.ts";
export type { TuffError, TuffErrorOf } from "./src/errors.ts";
export type { Ok, Err, Result } from "./src/result.ts";

export function evaluateTuff(source: string): Result<number, TuffError> {
  const tokenized = tokenize(source);
  if (!tokenized.ok) return tokenized;
  const program = parseProgram(tokenized.value, { start: source.length, end: source.length });
  if (!program.ok) return program;
  const resolved = resolve(program.value, undefined);
  if (!resolved.ok) return resolved;
  return evaluate(program.value, undefined);
}
