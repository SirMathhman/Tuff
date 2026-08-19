import type { Value } from "../ast.js";
import { ok, type EvalError, type Result } from "../errors.js";
import { advance, peek, unexpected, type Cursor } from "./cursor.js";

/** Parse a primary value: a number, bool, or identifier literal. */
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
  return unexpected(cursor);
}

/**
 * Parse a value expression: a primary (number, bool, ident) followed by zero
 * or more binary operations (`==`, `!=`, `<`, `<=`, `>`, `>=`), chained
 * left-associatively.
 */
export function parseValue(cursor: Cursor): Result<Value, EvalError> {
  const left = parsePrimary(cursor);
  if (!left.ok) {
    return left;
  }
  let value = left.value;
  while (true) {
    const operatorToken = peek(cursor);
    if (operatorToken?.kind !== "binary") {
      break;
    }
    advance(cursor);
    const right = parsePrimary(cursor);
    if (!right.ok) {
      return right;
    }
    value = {
      kind: "binary",
      operator: operatorToken.operator,
      left: value,
      right: right.value,
      position: value.position,
    };
  }
  return ok(value);
}

/** Consume an optional trailing semicolon after a statement. */
function consumeSemicolon(cursor: Cursor): void {
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
