import type { Statement, Value } from "../ast.js";
import { err, ok, type EvalError, type Result } from "../errors.js";
import { advance, atEnd, peek, unexpected, type Cursor } from "./cursor.js";
import { parseValue, parseValueAndSemicolon } from "./expressions.js";

/**
 * Parse the `= value` tail shared by `let` and assignment statements: an
 * assign token, a value expression, and an optional trailing semicolon.
 */
function parseAssignedValue(cursor: Cursor): Result<Value, EvalError> {
  if (peek(cursor)?.kind !== "assign") {
    return unexpected(cursor);
  }
  advance(cursor);
  return parseValueAndSemicolon(cursor);
}

/** Parse a `let [mut] name = value` declaration. */
function parseLet(cursor: Cursor, position: number): Result<Statement, EvalError> {
  advance(cursor);
  let mutable = false;
  if (peek(cursor)?.kind === "mut") {
    mutable = true;
    advance(cursor);
  }
  const name = peek(cursor);
  if (name?.kind !== "ident" || peek(cursor) === undefined) {
    return unexpected(cursor);
  }
  advance(cursor);
  const value = parseAssignedValue(cursor);
  if (!value.ok) {
    return value;
  }
  return ok({ kind: "let", name: name.value, mutable, value: value.value, position });
}

/** Parse a `return value` statement. */
function parseReturn(cursor: Cursor, position: number): Result<Statement, EvalError> {
  advance(cursor);
  const value = parseValueAndSemicolon(cursor);
  if (!value.ok) {
    return value;
  }
  return ok({ kind: "return", value: value.value, position });
}

/** Parse a `{ ... }` block into its statement list. */
function parseBlock(cursor: Cursor): Result<Statement[], EvalError> {
  if (peek(cursor)?.kind !== "lbrace") {
    return unexpected(cursor);
  }
  advance(cursor);
  return parseStatements(cursor, true);
}

/**
 * Parse a `( condition )` group shared by `if` and `while`: an lparen, a value
 * expression, and a matching rparen.
 */
function parseCondition(cursor: Cursor): Result<Value, EvalError> {
  if (peek(cursor)?.kind !== "lparen") {
    return unexpected(cursor);
  }
  advance(cursor);
  const condition = parseValue(cursor);
  if (!condition.ok) {
    return condition;
  }
  if (peek(cursor)?.kind !== "rparen") {
    return unexpected(cursor);
  }
  advance(cursor);
  return condition;
}

/** Parse an `if (condition) { ... } [else { ... }]` statement. */
function parseIf(cursor: Cursor, position: number): Result<Statement, EvalError> {
  advance(cursor);
  const condition = parseCondition(cursor);
  if (!condition.ok) {
    return condition;
  }
  const then = parseBlock(cursor);
  if (!then.ok) {
    return then;
  }
  let elseBranch: Statement[] | undefined;
  if (peek(cursor)?.kind === "else") {
    advance(cursor);
    const elseBlock = parseBlock(cursor);
    if (!elseBlock.ok) {
      return elseBlock;
    }
    elseBranch = elseBlock.value;
  }
  return ok({
    kind: "if",
    condition: condition.value,
    then: then.value,
    else: elseBranch,
    position,
  });
}

/** Parse a `while (condition) { ... }` loop statement. */
function parseWhile(cursor: Cursor, position: number): Result<Statement, EvalError> {
  advance(cursor);
  const condition = parseCondition(cursor);
  if (!condition.ok) {
    return condition;
  }
  const body = parseBlock(cursor);
  if (!body.ok) {
    return body;
  }
  return ok({ kind: "while", condition: condition.value, body: body.value, position });
}

/**
 * Parse an assignment target (lvalue): an identifier or a dereference
 * (`*ptr`), which may nest (`**p`).
 */
function parseLValue(cursor: Cursor): Result<Value, EvalError> {
  const token = peek(cursor);
  if (!token) {
    return unexpected(cursor);
  }
  if (token.kind === "ident") {
    advance(cursor);
    return ok({ kind: "ident", name: token.value, position: token.position });
  }
  if (token.kind === "deref") {
    advance(cursor);
    const target = parseLValue(cursor);
    if (!target.ok) {
      return target;
    }
    return ok({ kind: "deref", target: target.value, position: token.position });
  }
  return unexpected(cursor);
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
 * Parse a single statement (`let`, `return`, `if`, `while`, or `ident = value`),
 * consuming an optional trailing semicolon.
 */
function parseStatement(cursor: Cursor): Result<Statement, EvalError> {
  const head = peek(cursor);
  if (!head) {
    return unexpected(cursor);
  }
  if (head.kind === "let") {
    return parseLet(cursor, head.position);
  }
  if (head.kind === "return") {
    return parseReturn(cursor, head.position);
  }
  if (head.kind === "if") {
    return parseIf(cursor, head.position);
  }
  if (head.kind === "while") {
    return parseWhile(cursor, head.position);
  }
  if (head.kind === "ident" || head.kind === "deref") {
    const target = parseLValue(cursor);
    if (!target.ok) {
      return target;
    }
    return parseAssign(cursor, target.value, head.position);
  }
  return unexpected(cursor);
}

/**
 * Parse a list of statements, recursing into `{ ... }` blocks. When `inBlock`
 * is set, a `}` ends the block; at the top level a `}` is an error.
 */
export function parseStatements(cursor: Cursor, inBlock: boolean): Result<Statement[], EvalError> {
  const statements: Statement[] = [];
  while (!atEnd(cursor)) {
    const head = peek(cursor)!;
    if (head.kind === "rbrace") {
      if (!inBlock) {
        return err({ kind: "UnexpectedStatement", statement: "}", position: head.position });
      }
      advance(cursor);
      return ok(statements);
    }
    if (head.kind === "lbrace") {
      const inner = parseBlock(cursor);
      if (!inner.ok) {
        return inner;
      }
      statements.push({ kind: "block", statements: inner.value, position: head.position });
      continue;
    }
    cursor.statementStart = head.position;
    const statement = parseStatement(cursor);
    if (!statement.ok) {
      return statement;
    }
    statements.push(statement.value);
  }
  return ok(statements);
}
