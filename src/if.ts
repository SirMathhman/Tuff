import { EvalErrorCode, err } from "./errors.ts";
import type { Token } from "./tokens.ts";
import type { Env, Value } from "./env.ts";
import type { ParseBlockFn, ParseExpressionFn, ParseResult } from "./parse.ts";

function truthy(v: Value): boolean {
  return v.num !== 0;
}

/**
 * Parses `if (cond) then else otherwise`. `pos` points at the `if` keyword.
 * The condition must be parenthesized; the branches are expressions.
 */
export function parseIf(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
  parseExpression: ParseExpressionFn,
): ParseResult {
  const open = tokens[pos + 1];
  if (!open || open.type !== "paren" || open.paren !== "(") {
    return err(
      EvalErrorCode.ExpectedIfConditionClose,
      "",
      `"(" was expected after "if". Write the condition in parentheses, e.g. "if (x > 0) 1 else 0".`,
      pos + 1,
    );
  }
  const cond = parseExpression(tokens, pos + 2, env, parseBlock);
  if (!cond.ok) return cond;
  const close = tokens[cond.next];
  if (!close || close.type !== "paren" || close.paren !== ")") {
    return err(
      EvalErrorCode.ExpectedIfConditionClose,
      "",
      `A closing ")" was expected after the "if" condition. Add a matching ")".`,
      cond.next,
    );
  }
  const then = parseExpression(tokens, cond.next + 1, env, parseBlock);
  if (!then.ok) return then;
  const elseTok = tokens[then.next];
  if (!elseTok || elseTok.type !== "keyword" || elseTok.keyword !== "else") {
    return err(
      EvalErrorCode.ExpectedElse,
      "",
      `"else" was expected after the "if" branch. Add an "else" branch, e.g. "if (x > 0) 1 else 0".`,
      then.next,
    );
  }
  const otherwise = parseExpression(tokens, then.next + 1, env, parseBlock);
  if (!otherwise.ok) return otherwise;
  const value = truthy(cond.value) ? then.value : otherwise.value;
  return { ok: true, value, next: otherwise.next };
}
