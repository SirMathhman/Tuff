import type { Statement, Value } from "../core/ast.js";
import { ok, type EvalError, type Result } from "../core/errors.js";
import { advance, peek, unexpected, type Cursor } from "./cursor.js";
import {
  consumeSemicolon,
  parseIndexSuffixes,
  parseValue,
  parseValueAndSemicolon,
} from "./expressions.js";

/**
 * Parse the `= value` tail shared by `let` and assignment statements: an
 * assign token, a value expression, and an optional trailing semicolon.
 */
export function parseAssignedValue(cursor: Cursor): Result<Value, EvalError> {
  if (peek(cursor)?.kind !== "assign") {
    return unexpected(cursor);
  }
  advance(cursor);
  return parseValueAndSemicolon(cursor);
}

/**
 * Parse an assignment target (lvalue): an identifier or a dereference
 * (`*ptr`), which may nest (`**p`), optionally indexed (`arr[i]`).
 */
function parseLValue(cursor: Cursor): Result<Value, EvalError> {
  const token = peek(cursor);
  if (!token) {
    return unexpected(cursor);
  }
  let value: Value;
  if (token.kind === "ident") {
    advance(cursor);
    value = { kind: "ident", name: token.value, position: token.position };
  } else if (token.kind === "deref") {
    advance(cursor);
    const target = parseLValue(cursor);
    if (!target.ok) {
      return target;
    }
    value = { kind: "deref", target: target.value, position: token.position };
  } else {
    return unexpected(cursor);
  }
  return parseIndexSuffixes(cursor, value, "indexAssign");
}

/** Parse a `target = value` or `target += value` assignment statement. */
function parseAssign(
  cursor: Cursor,
  target: Value,
  position: number,
): Result<Statement, EvalError> {
  const operator = peek(cursor);
  if (operator?.kind === "compoundAssign") {
    advance(cursor);
    const value = parseValueAndSemicolon(cursor);
    if (!value.ok) {
      return value;
    }
    return ok({ kind: "assign", target, value: value.value, compound: "+=", position });
  }
  const value = parseAssignedValue(cursor);
  if (!value.ok) {
    return value;
  }
  return ok({ kind: "assign", target, value: value.value, position });
}

/**
 * Parse an identifier or dereference as either an assignment (`x = v`, `x += v`)
 * or, when `allowExpr` is set and no assignment follows, a bare expression.
 */
export function parseIdentOrExpr(
  cursor: Cursor,
  position: number,
  allowExpr: boolean,
): Result<Statement, EvalError> {
  const save = cursor.pos;
  const target = parseLValue(cursor);
  if (!target.ok) {
    return target;
  }
  const next = peek(cursor);
  if (next?.kind === "assign" || next?.kind === "compoundAssign") {
    return parseAssign(cursor, target.value, position);
  }
  // Not an assignment: a bare expression is allowed only as the final
  // statement of its list. Re-parse from the saved position as a value.
  if (!allowExpr) {
    return unexpected(cursor);
  }
  cursor.pos = save;
  return parseExprStatement(cursor, position);
}

/** Parse a bare value expression as the implicit program-result statement. */
export function parseExprStatement(cursor: Cursor, position: number): Result<Statement, EvalError> {
  const value = parseValue(cursor);
  if (!value.ok) {
    return value;
  }
  consumeSemicolon(cursor);
  return ok({ kind: "expr", value: value.value, position });
}
