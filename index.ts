import { lex } from "./src/lexer.ts";
import { parse } from "./src/parser.ts";
import { evalAst } from "./src/evaluator.ts";
import type { EvalResult } from "./src/evaluator.ts";

export type { EvalResult };

export function evaluate(input: string): EvalResult {
  const lexed = lex(input);
  if (!lexed.ok) {
    return lexed;
  }
  const parsed = parse(lexed.tokens);
  if (!parsed.ok) {
    return parsed;
  }
  return evalAst(parsed.ast);
}
