import type { Statement, Value, ValueBlock } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { advance, atEnd, peek, unexpected, type Cursor } from "./cursor.js";
import { parseAssignedValue, parseExprStatement, parseIdentOrExpr } from "./assignments.js";
import {
  consumeSemicolon,
  parseCondition,
  parseValue,
  parseValueAndSemicolon,
  type BlockValueParser,
} from "./expressions.js";

/** Parse a `let [mut] name = value` declaration. */
function parseLet(
  cursor: Cursor,
  position: number,
  block: BlockValueParser,
): Result<Statement, EvalError> {
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
  const value = parseAssignedValue(cursor, block);
  if (!value.ok) {
    return value;
  }
  return ok({ kind: "let", name: name.value, mutable, value: value.value, position });
}

/** Parse a `return value` statement. */
function parseReturn(
  cursor: Cursor,
  position: number,
  block: BlockValueParser,
): Result<Statement, EvalError> {
  advance(cursor);
  const value = parseValueAndSemicolon(cursor, block);
  if (!value.ok) {
    return value;
  }
  return ok({ kind: "return", value: value.value, position });
}

/** Parse a `{ ... }` block into its statement list. */
function parseBlock(
  cursor: Cursor,
  allowExpr: boolean,
  block: BlockValueParser,
): Result<Statement[], EvalError> {
  if (peek(cursor)?.kind !== "lbrace") {
    return unexpected(cursor);
  }
  advance(cursor);
  return parseStatements(cursor, true, allowExpr, block);
}

/**
 * Parse a `{ ... }` block as a value expression: its value is that of its
 * final bare expression, so the block must end in one. Passed to the
 * expression parser as an explicit dependency (which cannot import this
 * module without a cycle).
 */
export function parseBlockValue(cursor: Cursor): Result<Value, EvalError> {
  const position = peek(cursor)?.position ?? 0;
  const statements = parseBlock(cursor, true, parseBlockValue);
  if (!statements.ok) {
    return statements;
  }
  const last = statements.value[statements.value.length - 1];
  if (!last || last.kind !== "expr") {
    return err({
      kind: "UnexpectedStatement",
      statement: "{ ... }",
      position,
    });
  }
  const block: ValueBlock = { kind: "block", statements: statements.value, position };
  return ok(block);
}

/** The parsed head of an `if`/`while`: its condition and block body. */
interface ConditionAndBody {
  condition: Value;
  body: Statement[];
}

/**
 * Parse the shared head of `if`/`while`: the keyword, a `( condition )` group,
 * and the block body. Returns the condition and body on success.
 */
function parseConditionAndBody(
  cursor: Cursor,
  block: BlockValueParser,
): Result<ConditionAndBody, EvalError> {
  advance(cursor);
  const condition = parseCondition(cursor, block);
  if (!condition.ok) {
    return condition;
  }
  const body = parseBlock(cursor, false, block);
  if (!body.ok) {
    return body;
  }
  return ok({ condition: condition.value, body: body.value });
}

/** Parse an `if (condition) { ... } [else { ... }]` statement. */
function parseIf(
  cursor: Cursor,
  position: number,
  block: BlockValueParser,
): Result<Statement, EvalError> {
  const head = parseConditionAndBody(cursor, block);
  if (!head.ok) {
    return head;
  }
  let elseBranch: Statement[] | undefined;
  if (peek(cursor)?.kind === "else") {
    advance(cursor);
    const elseBlock = parseBlock(cursor, false, block);
    if (!elseBlock.ok) {
      return elseBlock;
    }
    elseBranch = elseBlock.value;
  }
  return ok({
    kind: "if",
    condition: head.value.condition,
    then: head.value.body,
    else: elseBranch,
    position,
  });
}

/**
 * Parse a `for (i in start..end) { ... }` loop: a `for` keyword, a parenthesized
 * `ident in value..value` range (exclusive of `end`), and a block body.
 */
function parseFor(
  cursor: Cursor,
  position: number,
  block: BlockValueParser,
): Result<Statement, EvalError> {
  advance(cursor);
  if (peek(cursor)?.kind !== "lparen") {
    return unexpected(cursor);
  }
  advance(cursor);
  const variable = peek(cursor);
  if (variable?.kind !== "ident") {
    return unexpected(cursor);
  }
  advance(cursor);
  if (peek(cursor)?.kind !== "in") {
    return unexpected(cursor);
  }
  advance(cursor);
  const range = parseValue(cursor, block);
  if (!range.ok) {
    return range;
  }
  if (peek(cursor)?.kind !== "rparen") {
    return unexpected(cursor);
  }
  advance(cursor);
  const body = parseBlock(cursor, false, block);
  if (!body.ok) {
    return body;
  }
  return ok({
    kind: "for",
    variable: variable.value,
    range: range.value,
    body: body.value,
    position,
  });
}

/** Parse a `break` statement that exits the enclosing `while` loop. */
function parseBreak(cursor: Cursor, position: number): Result<Statement, EvalError> {
  advance(cursor);
  consumeSemicolon(cursor);
  return ok({ kind: "break", position });
}

/** Parse a `continue` statement that skips to the next loop iteration. */
function parseContinue(cursor: Cursor, position: number): Result<Statement, EvalError> {
  advance(cursor);
  consumeSemicolon(cursor);
  return ok({ kind: "continue", position });
}

/** Parse a `while (condition) { ... }` loop statement. */
function parseWhile(
  cursor: Cursor,
  position: number,
  block: BlockValueParser,
): Result<Statement, EvalError> {
  const head = parseConditionAndBody(cursor, block);
  if (!head.ok) {
    return head;
  }
  return ok({
    kind: "while",
    condition: head.value.condition,
    body: head.value.body,
    position,
  });
}

/**
 * Parse a single statement (`let`, `return`, `if`, `while`, or `ident = value`),
 * consuming an optional trailing semicolon. When `allowExpr` is set (top level
 * only), a bare value expression may be parsed as the implicit program result.
 */
function parseStatement(
  cursor: Cursor,
  allowExpr: boolean,
  block: BlockValueParser,
): Result<Statement, EvalError> {
  const head = peek(cursor);
  if (!head) {
    return unexpected(cursor);
  }
  if (head.kind === "let") {
    return parseLet(cursor, head.position, block);
  }
  if (head.kind === "return") {
    return parseReturn(cursor, head.position, block);
  }
  if (head.kind === "if") {
    return parseIf(cursor, head.position, block);
  }
  if (head.kind === "while") {
    return parseWhile(cursor, head.position, block);
  }
  if (head.kind === "for") {
    return parseFor(cursor, head.position, block);
  }
  if (head.kind === "break") {
    return parseBreak(cursor, head.position);
  }
  if (head.kind === "continue") {
    return parseContinue(cursor, head.position);
  }
  if (head.kind === "ident" || head.kind === "deref") {
    return parseIdentOrExpr(cursor, head.position, allowExpr, block);
  }
  if (
    allowExpr &&
    (head.kind === "number" ||
      head.kind === "bool" ||
      head.kind === "lbracket" ||
      head.kind === "lparen" ||
      head.kind === "addressOf")
  ) {
    return parseExprStatement(cursor, head.position, block);
  }
  return unexpected(cursor);
}

/**
 * Parse a list of statements, recursing into `{ ... }` blocks. When `inBlock`
 * is set, a `}` ends the block; at the top level a `}` is an error. When
 * `allowExpr` is set, a bare value expression may be parsed as the final
 * statement (the implicit result of the list).
 */
export function parseStatements(
  cursor: Cursor,
  inBlock: boolean,
  allowExpr: boolean,
  block: BlockValueParser,
): Result<Statement[], EvalError> {
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
      const inner = parseBlock(cursor, false, block);
      if (!inner.ok) {
        return inner;
      }
      statements.push({ kind: "block", statements: inner.value, position: head.position });
      continue;
    }
    cursor.statementStart = head.position;
    const statement = parseStatement(cursor, allowExpr, block);
    if (!statement.ok) {
      return statement;
    }
    // A bare expression is only valid as the final statement of its list:
    // followed by end-of-input (top level) or a closing `}` (block value).
    if (statement.value.kind === "expr") {
      const next = peek(cursor);
      if (!atEnd(cursor) && next?.kind !== "rbrace") {
        return unexpected(cursor);
      }
    }
    statements.push(statement.value);
  }
  return ok(statements);
}
