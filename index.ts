import { lex } from "./src/lexer.ts";
import { parse } from "./src/parser.ts";
import { evalAst } from "./src/evaluator.ts";
import type { EvalError } from "./src/errors.ts";

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: EvalError };

export function evaluate(input: string): EvalResult {
  const lexed = lex(input);
  if (!lexed.ok) {
    return lexed;
  }
  const parsed = parse(lexed.tokens);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, value: evalAst(parsed.ast) };
}
