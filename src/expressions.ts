import type { Token } from "./tokens.ts";
import type { Env, Value } from "./env.ts";
import { parseFactor } from "./factors.ts";
import type { ParseBlockFn, ParseResult } from "./parse.ts";

export type {
  Parsed,
  ParseBlockFn,
  ParseExpressionFn,
  ParseResult,
} from "./parse.ts";

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

/**
 * Type-sensitive comparison: kinds must match, then numeric values.
 * `op` is one of "<", "<=", ">", ">=".
 */
function cmp(a: Value, b: Value, op: "<" | "<=" | ">" | ">="): boolean {
  if (a.kind !== b.kind) return false;
  switch (op) {
    case "<":
      return a.num < b.num;
    case "<=":
      return a.num <= b.num;
    case ">":
      return a.num > b.num;
    case ">=":
      return a.num >= b.num;
  }
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
  // Comparisons (==, !=, <, <=, >, >=) bind tighter than "&&" and are
  // left-associative.
  while (next < tokens.length) {
    const cmpTok = tokens[next];
    if (cmpTok && cmpTok.type === "cmp") {
      const rhs = parseExpression(tokens, next + 1, env, parseBlock);
      if (!rhs.ok) return rhs;
      const result =
        cmpTok.cmp === "=="
          ? eq(value, rhs.value)
          : cmpTok.cmp === "!="
            ? !eq(value, rhs.value)
            : cmp(value, rhs.value, cmpTok.cmp);
      value = bool(result);
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
      const rhs = parseFactor(
        tokens,
        next + 1,
        env,
        parseBlock,
        parseExpression,
      );
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
