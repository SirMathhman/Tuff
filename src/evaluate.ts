import { checkProgram } from "./check/index.ts";
import { lex } from "./lexer/index.ts";
import { parse } from "./parser/index.ts";
import { evaluateProgram } from "./eval/index.ts";
import { Err, Ok, andThen } from "./result.ts";
import type { Result } from "./result.ts";
import type { EvalError } from "./errors.ts";

function withSnippet(error: EvalError, source: string): EvalError {
  return { ...error, snippet: source.split("\n")[error.position.line - 1] ?? "" };
}

export function evaluate(input: string): Result<number, EvalError> {
  if (input.trim() === "") return Ok(0);
  const result = andThen(lex(input), (tokens) =>
    andThen(parse(tokens), (program) =>
      andThen(checkProgram(program), () => evaluateProgram(program)),
    ),
  );
  if (result.ok) return result;
  return Err(withSnippet(result.error, input));
}
