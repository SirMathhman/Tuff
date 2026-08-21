import { tokenize } from "./lexer.ts";
import { parse, type ParserState } from "./parser.ts";
import type { EvalError, Result } from "./types.ts";

export function evaluate(input: string): Result<number, EvalError> {
  if (input === "") return { ok: true, value: 0 };

  const state: ParserState = {
    tokens: tokenize(input),
    pos: 0,
    scopes: [new Map()],
    inputLength: input.trimEnd().length,
  };
  return parse(state);
}
