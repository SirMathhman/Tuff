import { OPERATOR_PRECEDENCE } from "./ast.ts";
import type { Assign, AstNode, Operator, Statement } from "./ast.ts";
import { tokenize } from "./tokenizer.ts";
import type { Token } from "./tokenizer.ts";

/**
 * A structured parse failure.
 */
export interface ParseError {
  /** What kind of failure this is. */
  kind: "syntax" | "invalid-number";
  /** The input that caused the failure. */
  input: string;
  /** The position where the failure was found. */
  position: number;
}

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
  error: ParseError;
}

/**
 * The outcome of parsing an expression.
 */
export type ParseResult = ParseSuccess | ParseFailure;

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
 * A cursor over a list of tokens.
 */
interface Cursor {
  /** The tokens. */
  tokens: Token[];
  /** The index of the current token. */
  index: number;
}

/**
 * Get the token at the cursor's current position.
 * @param {Cursor} cursor - The token cursor.
 * @returns {Token} The current token.
 */
function peek(cursor: Cursor): Token {
  return cursor.tokens[cursor.index]!;
}

/**
 * Get the token a fixed number of positions ahead of the cursor.
 * @param {Cursor} cursor - The token cursor.
 * @param {number} offset - How many tokens ahead to look.
 * @returns {Token} The token at that offset, or the eof token past the end.
 */
function peekAt(cursor: Cursor, offset: number): Token {
  const index = cursor.index + offset;
  if (index >= cursor.tokens.length) {
    return cursor.tokens[cursor.tokens.length - 1]!;
  }
  return cursor.tokens[index]!;
}

/**
 * Parse a factor (a single number).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed number node, or a structured error.
 */
function parseFactor(cursor: Cursor, input: string): ParseResult {
  const tok = peek(cursor);
  if (tok.type === "num") {
    cursor.index += 1;
    return { ok: true, value: { kind: "num", value: Number(tok.text) } };
  }
  if (tok.type === "kw-true" || tok.type === "kw-false") {
    cursor.index += 1;
    const val = tok.type === "kw-true" ? 1 : 0;
    return { ok: true, value: { kind: "num", value: val } };
  }
  if (tok.type === "ident") {
    cursor.index += 1;
    return { ok: true, value: { kind: "ident", name: tok.text } };
  }
  if (tok.type === "amp" || (tok.type === "op" && tok.text === "*")) {
    return parseRefOrDeref(cursor, input, tok);
  }
  if (tok.type === "lparen" || tok.type === "lbrace") {
    cursor.index += 1;
    const closeType = tok.type === "lparen" ? "rparen" : "rbrace";
    if (tok.type === "lbrace" && isBlockStart(cursor)) {
      return parseBlock(cursor, input, closeType);
    }
    const inner = parseExpr(cursor, input);
    if (!inner.ok) {
      return inner;
    }
    const close = expectClose(cursor, input, closeType);
    if (!close.ok) {
      return close;
    }
    return { ok: true, value: inner.value };
  }
  const kind = tok.type === "invalid" ? "invalid-number" : "syntax";
  return { ok: false, error: { kind, input, position: tok.position } };
}

/**
 * Parse a reference (& or &mut) or dereference (*) factor.
 * @param {Cursor} cursor - The token cursor, positioned at the & or * token.
 * @param {string} input - The original input.
 * @param {Token} tok - The current token (amp or op *).
 * @returns {ParseResult} The parsed ref or deref node, or a structured error.
 */
function parseRefOrDeref(
  cursor: Cursor,
  input: string,
  tok: Token,
): ParseResult {
  cursor.index += 1;
  if (tok.type === "amp") {
    let mutable = false;
    if (peek(cursor).type === "kw-mut") {
      mutable = true;
      cursor.index += 1;
    }
    const target = parseFactor(cursor, input);
    if (!target.ok) {
      return target;
    }
    return { ok: true, value: { kind: "ref", mutable, target: target.value } };
  }
  const target = parseFactor(cursor, input);
  if (!target.ok) {
    return target;
  }
  return { ok: true, value: { kind: "deref", target: target.value } };
}

/**
 * Check whether the tokens after an opening brace start a block.
 * @param {Cursor} cursor - The token cursor, positioned after the brace.
 * @returns {boolean} True if a let-binding or assignment follows.
 */
function isBlockStart(cursor: Cursor): boolean {
  const first = peek(cursor);
  if (first.type === "kw-let") {
    return true;
  }
  return first.type === "ident" && peekAt(cursor, 1).type === "assign";
}

/**
 * Parse a single let-binding (the let keyword has been consumed).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The binding, or a structured error.
 */
function parseBinding(cursor: Cursor, input: string): StatementResult {
  let mutable = false;
  if (peek(cursor).type === "kw-mut") {
    mutable = true;
    cursor.index += 1;
  }
  const nv = parseNameEqualsExpr(cursor, input);
  if (!nv.ok) {
    return nv;
  }
  const assign = nv.value as Assign;
  return {
    ok: true,
    value: { name: assign.name, mutable, value: assign.value },
  };
}

/**
 * Parse a `*target = expr ;` assignment-through-dereference statement.
 * @param {Cursor} cursor - The token cursor, positioned at the * token.
 * @param {string} input - The original input.
 * @returns {StatementResult} The deref assignment, or a structured error.
 */
function parseDerefAssign(cursor: Cursor, input: string): StatementResult {
  cursor.index += 1;
  const target = parseFactor(cursor, input);
  if (!target.ok) {
    return target;
  }
  const value = parseEqualsSemi(cursor, input);
  if (!value.ok) {
    return value;
  }
  return { ok: true, value: { target: target.value, value: value.value } };
}

/**
 * Parse a `name = expr ;` sequence.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {StatementResult} The assignment statement, or a structured error.
 */
function parseNameEqualsExpr(cursor: Cursor, input: string): StatementResult {
  const nameTok = peek(cursor);
  if (nameTok.type !== "ident") {
    return {
      ok: false,
      error: { kind: "syntax", input, position: nameTok.position },
    };
  }
  cursor.index += 1;
  const value = parseEqualsSemi(cursor, input);
  if (!value.ok) {
    return value;
  }
  return { ok: true, value: { name: nameTok.text, value: value.value } };
}

/**
 * Parse an `= expr ;` sequence (the name or target has been consumed).
 * @param {Cursor} cursor - The token cursor, positioned at the = token.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed value expression, or a structured error.
 */
function parseEqualsSemi(cursor: Cursor, input: string): ParseResult {
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
 * Parse a sequence of statements followed by a body expression.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed block node, or a structured error.
 */
function parseBlockBody(cursor: Cursor, input: string): ParseResult {
  const statements: Statement[] = [];
  for (;;) {
    const stmt = parseStatement(cursor, input);
    if (stmt === null) {
      break;
    }
    if (!stmt.ok) {
      return stmt;
    }
    statements.push(stmt.value);
  }
  const body = parseExpr(cursor, input);
  if (!body.ok) {
    return body;
  }
  return { ok: true, value: { kind: "block", statements, body: body.value } };
}

/**
 * Attempt to parse a single statement at the cursor position.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {StatementResult | null} The parsed statement, or null if no statement starts here.
 */
function parseStatement(cursor: Cursor, input: string): StatementResult | null {
  const kw = peek(cursor);
  if (kw.type === "kw-let") {
    cursor.index += 1;
    return parseBinding(cursor, input);
  }
  if (kw.type === "ident" && peekAt(cursor, 1).type === "assign") {
    return parseNameEqualsExpr(cursor, input);
  }
  if (
    kw.type === "op" &&
    kw.text === "*" &&
    peekAt(cursor, 2).type === "assign"
  ) {
    return parseDerefAssign(cursor, input);
  }
  return null;
}

/**
 * Parse a block body (the opening delimiter has been consumed).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {"rparen" | "rbrace"} closeType - The expected closing delimiter.
 * @returns {ParseResult} The parsed block node, or a structured error.
 */
function parseBlock(
  cursor: Cursor,
  input: string,
  closeType: "rparen" | "rbrace",
): ParseResult {
  const body = parseBlockBody(cursor, input);
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
function expectClose(
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

/**
 * Parse a left-associative chain of binary operators at a given precedence.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @param {number} precedence - The precedence level to consume.
 * @param {(c: Cursor, i: string) => ParseResult} parseOperand - Parses one operand.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
function parseBinaryLevel(
  cursor: Cursor,
  input: string,
  precedence: number,
  parseOperand: (c: Cursor, i: string) => ParseResult,
): ParseResult {
  const left = parseOperand(cursor, input);
  if (!left.ok) {
    return left;
  }
  let node: AstNode = left.value;
  for (;;) {
    const opTok = peek(cursor);
    if (
      opTok.type !== "op" ||
      OPERATOR_PRECEDENCE[opTok.text as Operator] !== precedence
    ) {
      break;
    }
    cursor.index += 1;
    const right = parseOperand(cursor, input);
    if (!right.ok) {
      return right;
    }
    node = {
      kind: "binop",
      op: opTok.text as Operator,
      left: node,
      right: right.value,
    };
  }
  return { ok: true, value: node };
}

/**
 * Parse a term (factors joined by *).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
function parseTerm(cursor: Cursor, input: string): ParseResult {
  return parseBinaryLevel(cursor, input, OPERATOR_PRECEDENCE["*"], parseFactor);
}
/**
 * Parse an additive expression (terms joined by + or -).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
function parseAddSub(cursor: Cursor, input: string): ParseResult {
  return parseBinaryLevel(cursor, input, OPERATOR_PRECEDENCE["+"], parseTerm);
}
/**
 * Parse an expression (additive terms joined by ||).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
function parseExpr(cursor: Cursor, input: string): ParseResult {
  return parseBinaryLevel(
    cursor,
    input,
    OPERATOR_PRECEDENCE["||"],
    parseAddSub,
  );
}

/**
 * Parse an expression into an AST.
 * @param {string} expression - The expression to parse.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
export function parse(expression: string): ParseResult {
  if (expression === "") {
    return { ok: true, value: { kind: "num", value: 0 } };
  }
  const cursor: Cursor = { tokens: tokenize(expression), index: 0 };
  const result = parseBlockBody(cursor, expression);
  if (!result.ok) {
    return result;
  }
  const tok = peek(cursor);
  if (tok.type !== "eof") {
    return {
      ok: false,
      error: { kind: "syntax", input: expression, position: tok.position },
    };
  }
  return result;
}
