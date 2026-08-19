import type { Program, Statement, Value } from "./ast.js";
import { err, ok, type EvalError, type Result } from "./errors.js";
import type { Token } from "./lexer.js";

/**
 * A cursor over the token stream. The parser advances it with `advance` and
 * inspects it with `peek`/`atEnd` — it never matches statements by fixed
 * token offsets or range-length arithmetic.
 */
type Cursor = {
  tokens: Token[];
  source: string;
  pos: number;
  /** Source offset where the current statement began (for error text). */
  statementStart: number;
};

function peek(cursor: Cursor): Token | undefined {
  return cursor.tokens[cursor.pos];
}

function advance(cursor: Cursor): void {
  cursor.pos++;
}

function atEnd(cursor: Cursor): boolean {
  return cursor.pos >= cursor.tokens.length;
}

/**
 * The source text of the statement the cursor is currently parsing: from the
 * statement's first token up to the current cursor position.
 */
function statementText(cursor: Cursor): string {
  const end = atEnd(cursor) ? cursor.source.length : peek(cursor)!.position;
  return cursor.source.slice(cursor.statementStart, end).trim();
}

function unexpected(cursor: Cursor): Result<never, EvalError> {
  return err({
    kind: "UnexpectedStatement",
    statement: statementText(cursor),
    position: cursor.statementStart,
  });
}

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
function parseValue(cursor: Cursor): Result<Value, EvalError> {
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

/**
 * Parse the `= value` tail shared by `let` and assignment statements: an
 * assign token, a value expression, and an optional trailing semicolon.
 */
function parseAssignedValue(cursor: Cursor): Result<Value, EvalError> {
  if (peek(cursor)?.kind !== "assign") {
    return unexpected(cursor);
  }
  advance(cursor);
  const value = parseValue(cursor);
  if (!value.ok) {
    return value;
  }
  consumeSemicolon(cursor);
  return value;
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
  const value = parseValue(cursor);
  if (!value.ok) {
    return value;
  }
  consumeSemicolon(cursor);
  return ok({ kind: "return", value: value.value, position });
}

/** Parse an `ident = value` assignment statement. */
function parseAssign(cursor: Cursor, name: string, position: number): Result<Statement, EvalError> {
  advance(cursor);
  const value = parseAssignedValue(cursor);
  if (!value.ok) {
    return value;
  }
  return ok({ kind: "assign", name, value: value.value, position });
}

/**
 * Parse a single statement (`let`, `return`, or `ident = value`), consuming an
 * optional trailing semicolon.
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
  if (head.kind === "ident") {
    return parseAssign(cursor, head.value, head.position);
  }
  return unexpected(cursor);
}

/**
 * Parse a list of statements, recursing into `{ ... }` blocks. When `inBlock`
 * is set, a `}` ends the block; at the top level a `}` is an error.
 */
function parseStatements(cursor: Cursor, inBlock: boolean): Result<Statement[], EvalError> {
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
      advance(cursor);
      const inner = parseStatements(cursor, true);
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

/**
 * Parse a token stream into a program using a cursor-based recursive descent
 * approach.
 * @param tokens - The token list from `tokenize`.
 * @param source - The original source text (used for error messages).
 * @returns A `Result` carrying the program, or a structured `EvalError`.
 */
export function parse(tokens: Token[], source: string): Result<Program, EvalError> {
  const cursor: Cursor = { tokens, source, pos: 0, statementStart: 0 };
  const statements = parseStatements(cursor, false);
  if (!statements.ok) {
    return statements;
  }
  if (statements.value.length === 0) {
    return err({ kind: "EmptyProgram" });
  }
  return ok({ statements: statements.value });
}
