import { EvalErrorCode, err, type EvalFailure } from "./errors.ts";
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
  const factor = parseFactor(tokens, pos, env, parseBlock);
  if (!factor.ok) return factor;
  let value = factor.value;
  let next = factor.next;
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "*" || tok.op === "/")) {
      const rhs = parseFactor(tokens, next + 1, env, parseBlock);
      if (!rhs.ok) return rhs;
      value = num(
        tok.op === "*"
          ? value.num * rhs.value.num
          : value.num / rhs.value.num,
      );
      next = rhs.next;
    } else {
      break;
    }
  }
  return { ok: true, value, next };
}

export function parseFactor(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
): ParseResult {
  const tok = tokens[pos];
  if (!tok) {
    return err(
      EvalErrorCode.UnexpectedEnd,
      "",
      "Expression ended before a number was found. Add a number.",
      pos,
    );
  }
  if (tok.type === "num") return { ok: true, value: num(tok.value), next: pos + 1 };
  if (tok.type === "bool") {
    return { ok: true, value: bool(tok.value), next: pos + 1 };
  }
  if (tok.type === "op" && tok.op === "*") {
    // Unary dereference: "*y" where y is a reference binding.
    const inner = tokens[pos + 1];
    if (!inner || inner.type !== "ident") {
      return err(
        EvalErrorCode.ExpectedReferenceTarget,
        "",
        `A variable name was expected after "*". Write "*<variable>" to dereference.`,
        pos + 1,
      );
    }
    const bound = env.get(inner.name);
    if (bound === undefined) {
      return err(
        EvalErrorCode.UnknownVariable,
        "",
        `Variable "${inner.name}" is not defined. Declare it with "let ${inner.name} = ...".`,
        pos + 1,
      );
    }
    if (bound.refTo === undefined) {
      return err(
        EvalErrorCode.DerefOfNonReference,
        "",
        `Variable "${inner.name}" is not a reference. Create one with "let ${inner.name} = &<variable>".`,
        pos,
      );
    }
    const target = env.get(bound.refTo);
    if (target === undefined) {
      return err(
        EvalErrorCode.UnknownVariable,
        "",
        `Variable "${bound.refTo}" is not defined. It was referenced by "${inner.name}".`,
        pos,
      );
    }
    return { ok: true, value: target.value, next: pos + 2 };
  }
  if (tok.type === "ident") {
    const bound = env.get(tok.name);
    if (bound === undefined) {
      return err(
        EvalErrorCode.UnknownVariable,
        "",
        `Variable "${tok.name}" is not defined. Declare it with "let ${tok.name} = ...".`,
        pos,
      );
    }
    return { ok: true, value: bound.value, next: pos + 1 };
  }
  if (tok.type === "paren" && tok.paren in OPEN_PARENS) {
    const expectedClose = OPEN_PARENS[tok.paren];
    if (tok.paren === "{") {
      return parseBlock(tokens, pos + 1, env);
    }
    const inner = parseExpression(tokens, pos + 1, env, parseBlock);
    if (!inner.ok) return inner;
    const close = tokens[inner.next];
    if (!close || close.type !== "paren" || close.paren !== expectedClose) {
      return err(
        EvalErrorCode.ExpectedCloseParen,
        "",
        `A closing "${expectedClose}" was expected. Add a matching "${expectedClose}".`,
        inner.next,
      );
    }
    return { ok: true, value: inner.value, next: inner.next + 1 };
  }
  return err(
    EvalErrorCode.ExpectedNumber,
    "",
    "A number, variable, or ( was expected here. Check operator placement.",
    pos,
  );
}

const OPEN_PARENS: Record<string, string> = {
  "(": ")",
  "{": "}",
};
