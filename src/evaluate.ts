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

export function evaluateTuff(input: string): Result<number, EvalError> {
  if (input.trim() === "") return Ok(0);
  const result = andThen(lex(input), (tokens) =>
    andThen(parse(tokens), (program) =>
      andThen(checkProgram(program), () => evaluateProgram(program)),
    ),
  );
  if (result.ok) return result;
  return Err(withSnippet(result.error, input));
}

export function compileTuffToJS(input: string): Result<string, EvalError> {
  // Naive impl
  const evaluated = evaluateTuff(input);
  if (!evaluated.ok) return Err(evaluated.error);
  return Ok("process.exit(" + evaluated.value + ");");
}

export function executeTuff(input: string, args: string[] = []): Result<number, EvalError> {
  const output = compileTuffToJS(input);
  if (!output.ok) return Err(output.error);

  let exitCode = 0;
  const process = {
    exit(code: number) {
      exitCode = code;
    },
  };

  new Function("process", "args", output.value)(process, args);
  return Ok(exitCode);
}
