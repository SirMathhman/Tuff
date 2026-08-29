import type { AstNode, EvalError, Statement, TypeName } from "./ast.ts";
import { peek, peekAt } from "./cursor.ts";
import type { Cursor } from "./cursor.ts";

/**
 * The identifiers that name a declared type.
 */
const TYPE_NAMES: Record<string, TypeName> = {
  Num: "Num",
  Bool: "Bool",
};

/**
 * A successful parse outcome.
 */
export interface ParseSuccess {
  /** Marks the outcome as successful. */
  ok: true;
  /** The parsed AST. */
  value: AstNode;
}

/**
 * A failed parse outcome.
 */
export interface ParseFailure {
  /** Marks the outcome as failed. */
  ok: false;
  /** The structured error. */
  error: EvalError;
}

/**
 * The outcome of parsing an expression.
 */
export type ParseResult = ParseSuccess | ParseFailure;

/**
 * A successful statements outcome.
 */
export interface StatementsSuccess {
  /** Marks the outcome as successful. */
  ok: true;
  /** The parsed statements. */
  value: Statement[];
}

/**
 * The outcome of parsing a sequence of statements.
 */
export type StatementsResult = StatementsSuccess | ParseFailure;

/**
 * A successful statement outcome.
 */
interface StatementSuccess {
  /** Marks the outcome as successful. */
  ok: true;
  /** The parsed statement. */
  value: Statement;
}

/**
 * The outcome of parsing a statement.
 */
type StatementResult = StatementSuccess | ParseFailure;

/**
 * A successful close-delimiter outcome.
 */
interface CloseSuccess {
  /** Marks the outcome as successful. */
  ok: true;
}

/**
 * The outcome of consuming a close delimiter.
 */
type CloseResult = CloseSuccess | ParseFailure;

/**
 * A successful type-annotation outcome.
 */
interface TypeAnnotationSuccess {
  /** Marks the outcome as successful. */
  ok: true;
  /** The declared type, or undefined when no annotation is present. */
  value: TypeName | undefined;
}

/**
 * The outcome of parsing a type annotation.
 */
type TypeAnnotationResult = TypeAnnotationSuccess | ParseFailure;

/**
 * Parse a single let-binding (the let keyword has been consumed).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {(c: Cursor, i: string) => ParseResult} parseExpr - Parses a full expression.
 * @returns {StatementResult} The binding, or a structured error.
 */
function parseBinding(
  cursor: Cursor,
  input: string,
  parseExpr: (c: Cursor, i: string) => ParseResult,
): StatementResult {
  let mutable = false;
  if (peek(cursor).type === "kw-mut") {
    mutable = true;
    cursor.index += 1;
  }
  const nameTok = peek(cursor);
  if (nameTok.type !== "ident") {
    return {
      ok: false,
      error: { kind: "syntax", input, position: nameTok.position },
    };
  }
  cursor.index += 1;
  const type = parseTypeAnnotation(cursor, input);
  if (!type.ok) {
    return type;
  }
  const value = parseEqualsSemi(cursor, input, parseExpr);
  if (!value.ok) {
    return value;
  }
  return {
    ok: true,
    value: {
      name: nameTok.text,
      mutable,
      type: type.value,
      value: value.value,
    },
  };
}

/**
 * Parse an optional `: TypeName` annotation after a binding name.
 * @param {Cursor} cursor - The token cursor, positioned after the name.
 * @param {string} input - The original input.
 * @returns {TypeAnnotationResult} The declared type (or undefined when absent), or a structured error.
 */
function parseTypeAnnotation(
  cursor: Cursor,
  input: string,
): TypeAnnotationResult {
  if (peek(cursor).type !== "colon") {
    return { ok: true, value: undefined };
  }
  cursor.index += 1;
  const nameTok = peek(cursor);
  if (nameTok.type !== "ident" || !(nameTok.text in TYPE_NAMES)) {
    return {
      ok: false,
      error: { kind: "syntax", input, position: nameTok.position },
    };
  }
  cursor.index += 1;
  return { ok: true, value: TYPE_NAMES[nameTok.text] };
}

/**
 * Parse a `*target = expr ;` assignment-through-dereference statement.
 * @param {Cursor} cursor - The token cursor, positioned at the * token.
 * @param {string} input - The original input.
 * @param {(c: Cursor, i: string) => ParseResult} parseFactor - Parses a factor.
 * @param {(c: Cursor, i: string) => ParseResult} parseExpr - Parses a full expression.
 * @returns {StatementResult} The deref assignment, or a structured error.
 */
function parseDerefAssign(
  cursor: Cursor,
  input: string,
  parseFactor: (c: Cursor, i: string) => ParseResult,
  parseExpr: (c: Cursor, i: string) => ParseResult,
): StatementResult {
  cursor.index += 1;
  const target = parseFactor(cursor, input);
  if (!target.ok) {
    return target;
  }
  const value = parseEqualsSemi(cursor, input, parseExpr);
  if (!value.ok) {
    return value;
  }
  return { ok: true, value: { target: target.value, value: value.value } };
}

/**
 * Parse a `name = expr ;` sequence.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {(c: Cursor, i: string) => ParseResult} parseExpr - Parses a full expression.
 * @returns {StatementResult} The assignment statement, or a structured error.
 */
function parseNameEqualsExpr(
  cursor: Cursor,
  input: string,
  parseExpr: (c: Cursor, i: string) => ParseResult,
): StatementResult {
  const nameTok = peek(cursor);
  if (nameTok.type !== "ident") {
    return {
      ok: false,
      error: { kind: "syntax", input, position: nameTok.position },
    };
  }
  cursor.index += 1;
  const value = parseEqualsSemi(cursor, input, parseExpr);
  if (!value.ok) {
    return value;
  }
  return { ok: true, value: { name: nameTok.text, value: value.value } };
}

/**
 * Parse an `= expr ;` sequence (the name or target has been consumed).
 * @param {Cursor} cursor - The token cursor, positioned at the = token.
 * @param {string} input - The original input.
 * @param {(c: Cursor, i: string) => ParseResult} parseExpr - Parses a full expression.
 * @returns {ParseResult} The parsed value expression, or a structured error.
 */
function parseEqualsSemi(
  cursor: Cursor,
  input: string,
  parseExpr: (c: Cursor, i: string) => ParseResult,
): ParseResult {
  const eq = peek(cursor);
  if (eq.type !== "assign") {
    return {
      ok: false,
      error: { kind: "syntax", input, position: eq.position },
    };
  }
  cursor.index += 1;
  const value = parseExpr(cursor, input);
  if (!value.ok) {
    return value;
  }
  const semi = peek(cursor);
  if (semi.type !== "semi") {
    return {
      ok: false,
      error: { kind: "syntax", input, position: semi.position },
    };
  }
  cursor.index += 1;
  return value;
}

/**
 * Parse a sequence of statements (the body expression is not consumed).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {(c: Cursor, i: string) => ParseResult} parseExpr - Parses a full expression.
 * @param {(c: Cursor, i: string) => ParseResult} parseFactor - Parses a factor.
 * @returns {ParseResult} The parsed statements, or a structured error.
 */
export function parseStatements(
  cursor: Cursor,
  input: string,
  parseExpr: (c: Cursor, i: string) => ParseResult,
  parseFactor: (c: Cursor, i: string) => ParseResult,
): StatementsResult {
  const statements: Statement[] = [];
  for (;;) {
    const stmt = parseStatement(cursor, input, parseExpr, parseFactor);
    if (stmt === null) {
      break;
    }
    if (!stmt.ok) {
      return stmt;
    }
    statements.push(stmt.value);
  }
  return { ok: true, value: statements };
}

/**
 * Parse a sequence of statements followed by a required body expression.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {(c: Cursor, i: string) => ParseResult} parseExpr - Parses a full expression.
 * @param {(c: Cursor, i: string) => ParseResult} parseFactor - Parses a factor.
 * @returns {ParseResult} The parsed block node, or a structured error.
 */
export function parseBlockBody(
  cursor: Cursor,
  input: string,
  parseExpr: (c: Cursor, i: string) => ParseResult,
  parseFactor: (c: Cursor, i: string) => ParseResult,
): ParseResult {
  const stmts = parseStatements(cursor, input, parseExpr, parseFactor);
  if (!stmts.ok) {
    return stmts;
  }
  const body = parseExpr(cursor, input);
  if (!body.ok) {
    return body;
  }
  return {
    ok: true,
    value: { kind: "block", statements: stmts.value, body: body.value },
  };
}

/**
 * Attempt to parse a single statement at the cursor position.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {(c: Cursor, i: string) => ParseResult} parseExpr - Parses a full expression.
 * @param {(c: Cursor, i: string) => ParseResult} parseFactor - Parses a factor.
 * @returns {StatementResult | null} The parsed statement, or null if no statement starts here.
 */
function parseStatement(
  cursor: Cursor,
  input: string,
  parseExpr: (c: Cursor, i: string) => ParseResult,
  parseFactor: (c: Cursor, i: string) => ParseResult,
): StatementResult | null {
  const kw = peek(cursor);
  if (kw.type === "kw-let") {
    cursor.index += 1;
    return parseBinding(cursor, input, parseExpr);
  }
  if (kw.type === "ident" && peekAt(cursor, 1).type === "assign") {
    return parseNameEqualsExpr(cursor, input, parseExpr);
  }
  if (
    kw.type === "op" &&
    kw.text === "*" &&
    peekAt(cursor, 2).type === "assign"
  ) {
    return parseDerefAssign(cursor, input, parseFactor, parseExpr);
  }
  return null;
}

/**
 * Parse a block body (the opening delimiter has been consumed).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {"rparen" | "rbrace"} closeType - The expected closing delimiter.
 * @param {(c: Cursor, i: string) => ParseResult} parseExpr - Parses a full expression.
 * @param {(c: Cursor, i: string) => ParseResult} parseFactor - Parses a factor.
 * @returns {ParseResult} The parsed block node, or a structured error.
 */
export function parseBlock(
  cursor: Cursor,
  input: string,
  closeType: "rparen" | "rbrace",
  parseExpr: (c: Cursor, i: string) => ParseResult,
  parseFactor: (c: Cursor, i: string) => ParseResult,
): ParseResult {
  const body = parseBlockBody(cursor, input, parseExpr, parseFactor);
  if (!body.ok) {
    return body;
  }
  const close = expectClose(cursor, input, closeType);
  if (!close.ok) {
    return close;
  }
  return body;
}

/**
 * Consume the closing delimiter of a group.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {"rparen" | "rbrace"} closeType - The expected closing delimiter.
 * @returns {CloseResult} A success marker, or a structured error.
 */
export function expectClose(
  cursor: Cursor,
  input: string,
  closeType: "rparen" | "rbrace",
): CloseResult {
  const close = peek(cursor);
  if (close.type !== closeType) {
    return {
      ok: false,
      error: { kind: "syntax", input, position: close.position },
    };
  }
  cursor.index += 1;
  return { ok: true };
}
