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
  op: "||" | "==" | "<" | "+" | "-" | "*";
  left: Expr;
  right: Expr;
  pos: number;
}

/**
 * A tuple literal expression: a comma-separated list of expressions.
 */
export interface TupleExpr {
  type: "Tuple";
  elements: Expr[];
  pos: number;
}

/**
 * A field access expression: reads an element of a tuple by index.
 */
export interface FieldAccessExpr {
  type: "FieldAccess";
  object: Expr;
  index: number;
  pos: number;
}

/**
 * A reference expression: takes the address of its operand variable.
 */
export interface RefExpr {
  type: "Ref";
  operand: Expr;
  pos: number;
}

/**
 * A dereference expression: reads the value pointed to by its operand.
 */
export interface DerefExpr {
  type: "Deref";
  operand: Expr;
  pos: number;
}

/**
 * An expression: a number or boolean literal, an identifier reference,
 * a binary operator expression, a tuple literal, a field access, a
 * reference, or a dereference.
 */
export type Expr =
  | NumberExpr
  | IdentifierExpr
  | BooleanExpr
  | BinaryExpr
  | TupleExpr
  | FieldAccessExpr
  | RefExpr
  | DerefExpr;

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
 * Parse a comparison expression: `==` or `<`.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseEquality(state: ParserState): ParseExprResult {
  const first = parseAddition(state);
  if (!first.ok) return first;
  let expr = first.expr;
  while (
    !atEnd(state) &&
    (peek(state).value === "==" || peek(state).value === "<")
  ) {
    const opTok = next(state);
    const right = parseAddition(state);
    if (!right.ok) return right;
    expr = {
      type: "Binary",
      op: opTok.value as "==" | "<",
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
  const first = parseUnary(state);
  if (!first.ok) return first;
  let expr = first.expr;
  while (!atEnd(state) && peek(state).value === "*") {
    const opTok = next(state);
    const right = parseUnary(state);
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
 * Parse a unary (prefix) expression: `*` dereference or `&` reference,
 * or a primary expression. Prefix operators are right-associative and
 * bind tighter than the `*` multiplication operator.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseUnary(state: ParserState): ParseExprResult {
  if (
    !atEnd(state) &&
    (peek(state).value === "*" || peek(state).value === "&")
  ) {
    const opTok = next(state);
    const operand = parseUnary(state);
    if (!operand.ok) return operand;
    const type = opTok.value === "*" ? "Deref" : "Ref";
    return {
      ok: true,
      expr: { type, operand: operand.expr, pos: opTok.pos },
    };
  }
  return parsePrimary(state);
}

/**
 * Parse a primary expression, including postfix `.index` field access
 * and `[index]` array access.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parsePrimary(state: ParserState): ParseExprResult {
  const first = parseAtom(state);
  if (!first.ok) return first;
  let expr = first.expr;
  while (
    !atEnd(state) &&
    (peek(state).value === "." || peek(state).value === "[")
  ) {
    const r = parsePostfix(state, expr);
    if (!r.ok) return r;
    expr = r.expr;
  }
  return { ok: true, expr };
}

/**
 * Parse one postfix operator (`.index` or `[index]`) applied to an
 * already-parsed expression.
 *
 * @param state - The parser state, positioned at the postfix operator.
 * @param object - The expression the postfix operator applies to.
 * @returns The field access expression, or a structured parse error.
 */
function parsePostfix(state: ParserState, object: Expr): ParseExprResult {
  if (peek(state).value === ".") {
    const dot = next(state);
    const idxTok = next(state);
    if (idxTok?.kind !== "number" || !/^\d+$/.test(idxTok.value)) {
      return {
        ok: false,
        error: parseError(
          "Expected tuple index after '.'",
          idxTok?.pos ?? dot.pos,
        ),
      };
    }
    return {
      ok: true,
      expr: {
        type: "FieldAccess",
        object,
        index: Number(idxTok.value),
        pos: dot.pos,
      },
    };
  }
  const open = next(state);
  const idx = parseExpr(state);
  if (!idx.ok) return idx;
  if (idx.expr.type !== "Number" || !Number.isInteger(idx.expr.value)) {
    return {
      ok: false,
      error: parseError("Expected integer index in '[]'", idx.expr.pos),
    };
  }
  const close = next(state);
  if (close.value !== "]") {
    return {
      ok: false,
      error: parseError("Expected ']' after index", close.pos),
    };
  }
  return {
    ok: true,
    expr: {
      type: "FieldAccess",
      object,
      index: idx.expr.value,
      pos: open.pos,
    },
  };
}

/**
 * Parse an atom: a number or boolean literal, an identifier, or a tuple.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseAtom(state: ParserState): ParseExprResult {
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
  if (t.value === "(") {
    return parseTuple(state);
  }
  if (t.value === "[") {
    return parseArray(state);
  }
  return {
    ok: false,
    error: parseError(`Expected expression, got: ${t.value}`, t.pos),
  };
}

/**
 * Parse a tuple literal: a comma-separated list of expressions in parens.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseTuple(state: ParserState): ParseExprResult {
  return parseDelimitedList(state, ")", "tuple");
}

/**
 * Parse an array literal: a comma-separated list of expressions in brackets.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseArray(state: ParserState): ParseExprResult {
  return parseDelimitedList(state, "]", "array");
}

/**
 * Parse a comma-separated list of expressions delimited by a matching pair
 * of brackets, producing a tuple expression.
 *
 * @param state - The parser state, positioned at the opening bracket.
 * @param closeValue - The value of the expected closing bracket token.
 * @param name - The literal's name, for error messages.
 * @returns The expression, or a structured parse error.
 */
function parseDelimitedList(
  state: ParserState,
  closeValue: string,
  name: string,
): ParseExprResult {
  const open = next(state);
  const first = parseExpr(state);
  if (!first.ok) return first;
  const elements = [first.expr];
  while (!atEnd(state) && peek(state).value === ",") {
    next(state);
    const el = parseExpr(state);
    if (!el.ok) return el;
    elements.push(el.expr);
  }
  const close = next(state);
  if (close.value !== closeValue) {
    return {
      ok: false,
      error: parseError(`Expected '${closeValue}' after ${name}`, close.pos),
    };
  }
  return { ok: true, expr: { type: "Tuple", elements, pos: open.pos } };
}
