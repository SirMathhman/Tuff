import type { Result } from "../errors.ts";
import { fail } from "../errors.ts";
import { advance, peek } from "./types.ts";
import type { Cursor, Expr } from "./types.ts";

export function parseExpr(c: Cursor): Result<Expr> {
  return parseRange(c);
}

function parseRange(c: Cursor): Result<Expr> {
  let left = parseOr(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "..") {
    advance(c);
    const right = parseOr(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        range: { start: left.value, end: right.value },
        position: left.value.position,
      },
    };
  }
  return left;
}

function parseOr(c: Cursor): Result<Expr> {
  let left = parseAnd(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "||") {
    advance(c);
    const right = parseAnd(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        binary: { op: "||", left: left.value, right: right.value },
        position: left.value.position,
      },
    };
  }
  return left;
}

function parseAnd(c: Cursor): Result<Expr> {
  let left = parseComparison(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "&&") {
    advance(c);
    const right = parseComparison(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        binary: { op: "&&", left: left.value, right: right.value },
        position: left.value.position,
      },
    };
  }
  return left;
}

function parseComparison(c: Cursor): Result<Expr> {
  let left = parseAddition(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "<" || peek(c)?.value === "==") {
    const op = advance(c);
    const right = parseAddition(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        binary: {
          op: op.value as "<" | "==",
          left: left.value,
          right: right.value,
        },
        position: left.value.position,
      },
    };
  }
  return left;
}

function parseAddition(c: Cursor): Result<Expr> {
  let left = parseMultiplication(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "+" || peek(c)?.value === "-") {
    const op = advance(c);
    const right = parseMultiplication(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        binary: {
          op: op.value as "+" | "-",
          left: left.value,
          right: right.value,
        },
        position: left.value.position,
      },
    };
  }
  return left;
}

function parseMultiplication(c: Cursor): Result<Expr> {
  let left = parseOperand(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "*") {
    advance(c);
    const right = parseOperand(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        binary: {
          op: "*",
          left: left.value,
          right: right.value,
        },
        position: left.value.position,
      },
    };
  }
  return left;
}

function parseOperand(c: Cursor): Result<Expr> {
  const token = peek(c);
  if (!token) return fail({ kind: "UnsupportedExpression", position: 0 });
  if (token.value === "(") {
    const open = advance(c);
    const inner = parseExpr(c);
    if (!inner.ok) return inner;
    if (peek(c)?.value !== ")")
      return fail({
        kind: "UnbalancedParen",
        position: c.tokens[c.tokens.length - 1]?.position ?? open.position,
      });
    advance(c);
    return {
      ok: true,
      value: { grouped: inner.value, position: open.position },
    };
  }
  if (token.kind === "number") {
    advance(c);
    return {
      ok: true,
      value: { literal: Number(token.value), position: token.position },
    };
  }
  if (token.kind === "keyword") {
    if (token.value === "true") {
      advance(c);
      return { ok: true, value: { literal: true, position: token.position } };
    }
    if (token.value === "false") {
      advance(c);
      return { ok: true, value: { literal: false, position: token.position } };
    }
    return fail({ kind: "UnsupportedExpression", position: token.position });
  }
  if (token.kind === "identifier") {
    advance(c);
    return {
      ok: true,
      value: { identifier: token.value, position: token.position },
    };
  }
  return fail({ kind: "UnsupportedExpression", position: token.position });
}
