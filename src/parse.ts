import type { EvalFailure } from "./errors.ts";
import type { Token } from "./tokens.ts";
import type { Env, Value } from "./env.ts";

export interface Parsed {
  ok: true;
  value: Value;
  next: number;
}

export type ParseResult = Parsed | EvalFailure;

/** Parses a `{ ... }` block. Provided by the statements module. */
export type ParseBlockFn = (
  tokens: Token[],
  pos: number,
  env: Env,
) => ParseResult;

/** Parses a full expression. Provided by the expressions module. */
export type ParseExpressionFn = (
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
) => ParseResult;
