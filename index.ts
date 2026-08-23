import { lex } from "./src/lexer.ts";
import { parse } from "./src/parser.ts";
import { evaluateProgram } from "./src/evaluator.ts";
import { TuffError, toEvalError } from "./src/errors.ts";
import { Err, Ok } from "./src/result.ts";
import type { Result } from "./src/result.ts";
import type { EvalError } from "./src/errors.ts";

export type { Result } from "./src/result.ts";
export { Ok, Err } from "./src/result.ts";
export type { EvalError } from "./src/errors.ts";

export function evaluate(input: string): Result<number, EvalError> {
  if (input.trim() === "") return Ok(0);
  try {
    const program = parse(lex(input));
    return Ok(evaluateProgram(program));
  } catch (e) {
    if (e instanceof TuffError) {
      return Err(toEvalError(e, input));
    }
    return Err({
      kind: "runtime",
      message: e instanceof Error ? e.message : String(e),
      position: { line: 1, column: 1 },
      snippet: input,
    });
  }
}
