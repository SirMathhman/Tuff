import { lex } from "./src/lexer.ts";
import { parse } from "./src/parser.ts";
import { evaluateProgram } from "./src/evaluator.ts";
import { Err, Ok, andThen } from "./src/result.ts";
import type { Result } from "./src/result.ts";
import type { EvalError } from "./src/errors.ts";

export type { Result } from "./src/result.ts";
export { Ok, Err, map, andThen, unwrapOr } from "./src/result.ts";
export type { EvalError } from "./src/errors.ts";

function withSnippet(error: EvalError, source: string): EvalError {
  return { ...error, snippet: source.split("\n")[error.position.line - 1] ?? "" };
}

export function evaluate(input: string): Result<number, EvalError> {
  if (input.trim() === "") return Ok(0);
  const result = andThen(lex(input), (tokens) =>
    andThen(parse(tokens), (program) => evaluateProgram(program)),
  );
  if (result.ok) return result;
  return Err(withSnippet(result.error, input));
}
