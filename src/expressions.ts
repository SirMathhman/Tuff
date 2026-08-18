import type { EvalFailure } from "./errors.ts";
import type { Token } from "./tokens.ts";
import type { Env, Value } from "./env.ts";
import { parseFactor } from "./factors.ts";

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

function num(n: number): Value {
  return { kind: "num", num: n };
}

function bool(b: boolean): Value {
  return { kind: "bool", num: b ? 1 : 0 };
}

function truthy(v: Value): boolean {
  return v.num !== 0;
}

/** Type-sensitive equality: kinds must match, then numeric values. */
function eq(a: Value, b: Value): boolean {
  return a.kind === b.kind && a.num === b.num;
}

export function parseExpression(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
): ParseResult {
  const term = parseTerm(tokens, pos, env, parseBlock);
  if (!term.ok) return term;
  let value = term.value;
  let next = term.next;
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "+" || tok.op === "-")) {
      const rhs = parseTerm(tokens, next + 1, env, parseBlock);
      if (!rhs.ok) return rhs;
      value = num(
        tok.op === "+" ? value.num + rhs.value.num : value.num - rhs.value.num,
      );
      next = rhs.next;
    } else {
      break;
    }
  }
  // "==" binds tighter than "&&" and is left-associative.
  while (next < tokens.length) {
    const eqTok = tokens[next];
    if (eqTok && eqTok.type === "eq") {
      const rhs = parseExpression(tokens, next + 1, env, parseBlock);
      if (!rhs.ok) return rhs;
      value = bool(eq(value, rhs.value));
      next = rhs.next;
    } else {
      break;
    }
  }
  // "&&" binds tighter than "||" and is left-associative.
  while (next < tokens.length) {
    const andTok = tokens[next];
    if (andTok && andTok.type === "and") {
      const rhs = parseExpression(tokens, next + 1, env, parseBlock);
      if (!rhs.ok) return rhs;
      value = bool(truthy(value) && truthy(rhs.value));
      next = rhs.next;
    } else {
      break;
    }
  }
  // "||" has the lowest precedence and is right-associative.
  const orTok = tokens[next];
  if (orTok && orTok.type === "or") {
    const rhs = parseExpression(tokens, next + 1, env, parseBlock);
    if (!rhs.ok) return rhs;
    value = bool(truthy(value) || truthy(rhs.value));
    next = rhs.next;
  }
  return { ok: true, value, next };
}

export function parseTerm(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
): ParseResult {
  const factor = parseFactor(tokens, pos, env, parseBlock, parseExpression);
  if (!factor.ok) return factor;
  let value = factor.value;
  let next = factor.next;
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "*" || tok.op === "/")) {
      const rhs = parseFactor(tokens, next + 1, env, parseBlock, parseExpression);
      if (!rhs.ok) return rhs;
      value = num(
        tok.op === "*" ? value.num * rhs.value.num : value.num / rhs.value.num,
      );
      next = rhs.next;
    } else {
      break;
    }
  }
  return { ok: true, value, next };
}
