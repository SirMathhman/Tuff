import type { TuffError } from "./errors.ts";
import { parseError } from "./errors.ts";
import type { Token } from "./tokenizer.ts";

/**
 * A numeric literal expression.
 */
export interface NumberExpr {
  type: "Number";
  value: number;
  pos: number;
}

/**
 * An identifier reference expression.
 */
export interface IdentifierExpr {
  type: "Identifier";
  name: string;
  pos: number;
}

/**
 * A boolean literal expression.
 */
export interface BooleanExpr {
  type: "Boolean";
  value: boolean;
  pos: number;
}

/**
 * A binary operator expression.
 */
export interface BinaryExpr {
  type: "Binary";
  op: "||" | "==" | "+" | "-" | "*";
  left: Expr;
  right: Expr;
  pos: number;
}

/**
 * An expression: a number or boolean literal, an identifier reference,
 * or a binary operator expression.
 */
export type Expr = NumberExpr | IdentifierExpr | BooleanExpr | BinaryExpr;

/**
 * A successful expression parse result.
 */
export interface ParseExprOk {
  ok: true;
  expr: Expr;
}

/**
 * A failed expression parse result.
 */
export interface ParseExprErr {
  ok: false;
  error: TuffError;
}

/**
 * The result of parsing an expression.
 */
export type ParseExprResult = ParseExprOk | ParseExprErr;

/**
 * Mutable parser state: the token list and the current cursor.
 */
export interface ParserState {
  tokens: Token[];
  idx: number;
}

/**
 * Peek at the current token without advancing.
 *
 * @param state - The parser state.
 * @returns The current token.
 */
export function peek(state: ParserState): Token {
  return state.tokens[state.idx] as Token;
}

/**
 * Consume and return the current token.
 *
 * @param state - The parser state.
 * @returns The consumed token.
 */
export function next(state: ParserState): Token {
  const t = state.tokens[state.idx] as Token;
  state.idx++;
  return t;
}

/**
 * Whether the cursor has reached the end of the token list.
 *
 * @param state - The parser state.
 * @returns True when no tokens remain.
 */
export function atEnd(state: ParserState): boolean {
  return state.idx >= state.tokens.length;
}

/**
 * Parse an expression, including `||` binary operators.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
export function parseExpr(state: ParserState): ParseExprResult {
  const first = parseEquality(state);
  if (!first.ok) return first;
  let expr = first.expr;
  while (!atEnd(state) && peek(state).value === "||") {
    const opTok = next(state);
    const right = parseEquality(state);
    if (!right.ok) return right;
    expr = {
      type: "Binary",
      op: "||",
      left: expr,
      right: right.expr,
      pos: opTok.pos,
    };
  }
  return { ok: true, expr };
}

/**
 * Parse an `==` comparison expression.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseEquality(state: ParserState): ParseExprResult {
  const first = parseAddition(state);
  if (!first.ok) return first;
  let expr = first.expr;
  while (!atEnd(state) && peek(state).value === "==") {
    const opTok = next(state);
    const right = parseAddition(state);
    if (!right.ok) return right;
    expr = {
      type: "Binary",
      op: "==",
      left: expr,
      right: right.expr,
      pos: opTok.pos,
    };
  }
  return { ok: true, expr };
}

/**
 * Parse a `+`/`-` addition expression.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseAddition(state: ParserState): ParseExprResult {
  const first = parseTerm(state);
  if (!first.ok) return first;
  let expr = first.expr;
  while (
    !atEnd(state) &&
    (peek(state).value === "+" || peek(state).value === "-")
  ) {
    const opTok = next(state);
    const right = parseTerm(state);
    if (!right.ok) return right;
    expr = {
      type: "Binary",
      op: opTok.value as "+" | "-",
      left: expr,
      right: right.expr,
      pos: opTok.pos,
    };
  }
  return { ok: true, expr };
}

/**
 * Parse a `*` multiplication expression.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseTerm(state: ParserState): ParseExprResult {
  const first = parsePrimary(state);
  if (!first.ok) return first;
  let expr = first.expr;
  while (!atEnd(state) && peek(state).value === "*") {
    const opTok = next(state);
    const right = parsePrimary(state);
    if (!right.ok) return right;
    expr = {
      type: "Binary",
      op: "*",
      left: expr,
      right: right.expr,
      pos: opTok.pos,
    };
  }
  return { ok: true, expr };
}

/**
 * Parse a primary expression: a number or boolean literal, or an identifier.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parsePrimary(state: ParserState): ParseExprResult {
  const t = peek(state);
  if (t.kind === "number") {
    next(state);
    return {
      ok: true,
      expr: { type: "Number", value: Number(t.value), pos: t.pos },
    };
  }
  if (t.kind === "boolean") {
    next(state);
    return {
      ok: true,
      expr: { type: "Boolean", value: t.value === "true", pos: t.pos },
    };
  }
  if (t.kind === "ident") {
    next(state);
    return {
      ok: true,
      expr: { type: "Identifier", name: t.value, pos: t.pos },
    };
  }
  return {
    ok: false,
    error: parseError(`Expected expression, got: ${t.value}`, t.pos),
  };
}
