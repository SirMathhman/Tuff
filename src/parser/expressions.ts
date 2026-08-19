import type { Value } from "../core/ast.js";
import { ok, type EvalError, type Result } from "../core/errors.js";
import { advance, peek, unexpected, type Cursor } from "./cursor.js";

/**
 * A block-value parser, registered by the statement parser at load time.
 * Expressions and statements mutually recurse through block values
 * (`{ ... }` as a value), so the statement parser hands its block-value
 * parser in here rather than importing it (which would be a module cycle).
 */
type BlockValueParser = (cursor: Cursor) => Result<Value, EvalError>;
let blockValueParser: BlockValueParser | undefined;

/** Register the block-value parser (called once by the statement parser). */
export function registerBlockValueParser(parser: BlockValueParser): void {
  blockValueParser = parser;
}

/** Parse an array literal `[e1, e2, ...]`. */
function parseArrayLiteral(cursor: Cursor, position: number): Result<Value, EvalError> {
  advance(cursor); // consume `[`
  const elements: Value[] = [];
  if (peek(cursor)?.kind === "rbracket") {
    advance(cursor);
    return ok({ kind: "array", elements, position });
  }
  for (;;) {
    const element = parseValue(cursor);
    if (!element.ok) {
      return element;
    }
    elements.push(element.value);
    const next = peek(cursor);
    if (next?.kind === "comma") {
      advance(cursor);
      continue;
    }
    if (next?.kind === "rbracket") {
      advance(cursor);
      return ok({ kind: "array", elements, position });
    }
    return unexpected(cursor);
  }
}

/** Parse a primary value: a number, bool, identifier, or array literal. */
function parsePrimary(cursor: Cursor): Result<Value, EvalError> {
  const token = peek(cursor);
  if (!token) {
    return unexpected(cursor);
  }
  if (token.kind === "number") {
    advance(cursor);
    return ok({ kind: "number", value: token.value, position: token.position });
  }
  if (token.kind === "bool") {
    advance(cursor);
    return ok({ kind: "bool", value: token.value, position: token.position });
  }
  if (token.kind === "ident") {
    advance(cursor);
    return ok({ kind: "ident", name: token.value, position: token.position });
  }
  if (token.kind === "lbracket") {
    return parseArrayLiteral(cursor, token.position);
  }
  if (token.kind === "lbrace") {
    if (!blockValueParser) {
      return unexpected(cursor);
    }
    return blockValueParser(cursor);
  }
  if (token.kind === "addressOf" || token.kind === "deref") {
    const operator = token.kind;
    advance(cursor);
    const target = parsePrimary(cursor);
    if (!target.ok) {
      return target;
    }
    if (operator === "addressOf") {
      return ok({
        kind: "addressOf",
        mutable: token.mutable,
        target: target.value,
        position: token.position,
      });
    }
    return ok({ kind: "deref", target: target.value, position: token.position });
  }
  return unexpected(cursor);
}

/**
 * Parse zero or more index suffixes (`[i]`) applied to `value`, producing
 * nodes of the given kind (`"index"` for reads, `"indexAssign"` for lvalues).
 */
export function parseIndexSuffixes(
  cursor: Cursor,
  value: Value,
  kind: "index" | "indexAssign",
): Result<Value, EvalError> {
  while (peek(cursor)?.kind === "lbracket") {
    const bracket = peek(cursor)!;
    advance(cursor);
    const index = parseValue(cursor);
    if (!index.ok) {
      return index;
    }
    if (peek(cursor)?.kind !== "rbracket") {
      return unexpected(cursor);
    }
    advance(cursor);
    value = { kind, target: value, index: index.value, position: bracket.position };
  }
  return ok(value);
}

/**
 * Parse a postfix expression: a primary followed by zero or more index
 * operations (`[i]`), which bind tighter than any binary operator.
 */
function parsePostfix(cursor: Cursor): Result<Value, EvalError> {
  const value = parsePrimary(cursor);
  if (!value.ok) {
    return value;
  }
  return parseIndexSuffixes(cursor, value.value, "index");
}

/**
 * Parse an additive expression: a postfix followed by zero or more `+`
 * operations, chained left-associatively.
 */
function parseAdditive(cursor: Cursor): Result<Value, EvalError> {
  let value = parsePostfix(cursor);
  if (!value.ok) {
    return value;
  }
  while (true) {
    const operatorToken = peek(cursor);
    if (operatorToken?.kind !== "binary" || operatorToken.operator !== "+") {
      break;
    }
    advance(cursor);
    const right = parsePostfix(cursor);
    if (!right.ok) {
      return right;
    }
    value = ok({
      kind: "binary",
      operator: "+",
      left: value.value,
      right: right.value,
      position: value.value.position,
    });
  }
  return value;
}

/**
 * Parse a value expression: an additive expression followed by zero or more
 * comparison operations (`==`, `!=`, `<`, `<=`, `>`, `>=`), chained
 * left-associatively.
 */
export function parseValue(cursor: Cursor): Result<Value, EvalError> {
  let value = parseAdditive(cursor);
  if (!value.ok) {
    return value;
  }
  while (true) {
    const operatorToken = peek(cursor);
    if (operatorToken?.kind !== "binary" || operatorToken.operator === "+") {
      break;
    }
    advance(cursor);
    const right = parseAdditive(cursor);
    if (!right.ok) {
      return right;
    }
    value = ok({
      kind: "binary",
      operator: operatorToken.operator,
      left: value.value,
      right: right.value,
      position: value.value.position,
    });
  }
  if (peek(cursor)?.kind === "range") {
    const rangeToken = peek(cursor)!;
    advance(cursor);
    const end = parseValue(cursor);
    if (!end.ok) {
      return end;
    }
    return ok({
      kind: "range",
      start: value.value,
      end: end.value,
      position: rangeToken.position,
    });
  }
  return value;
}

/** Consume an optional trailing semicolon after a statement. */
export function consumeSemicolon(cursor: Cursor): void {
  if (peek(cursor)?.kind === "semicolon") {
    advance(cursor);
  }
}

/** Parse a value expression followed by an optional trailing semicolon. */
export function parseValueAndSemicolon(cursor: Cursor): Result<Value, EvalError> {
  const value = parseValue(cursor);
  if (!value.ok) {
    return value;
  }
  consumeSemicolon(cursor);
  return value;
}
