import { OPERATOR_PRECEDENCE } from "./ast.ts";
import type { AstNode, Binding, Operator } from "./ast.ts";
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
 * A successful binding outcome.
 */
interface BindingSuccess {
  /** Marks the outcome as successful. */
  ok: true;
  /** The parsed binding. */
  value: Binding;
}

/**
 * The outcome of parsing a binding.
 */
type BindingResult = BindingSuccess | ParseFailure;

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
  if (tok.type === "ident") {
    cursor.index += 1;
    return { ok: true, value: { kind: "ident", name: tok.text } };
  }
  if (tok.type === "lparen" || tok.type === "lbrace") {
    cursor.index += 1;
    const closeType = tok.type === "lparen" ? "rparen" : "rbrace";
    if (tok.type === "lbrace" && peek(cursor).type === "kw-let") {
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
 * Parse a block body (the opening delimiter has been consumed).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed block node, or a structured error.
 */
/**
 * Parse a single let-binding (the let keyword has been consumed).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The binding, or a structured error.
 */
function parseBinding(cursor: Cursor, input: string): BindingResult {
  const nameTok = peek(cursor);
  if (nameTok.type !== "ident") {
    return {
      ok: false,
      error: { kind: "syntax", input, position: nameTok.position },
    };
  }
  cursor.index += 1;
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
  return { ok: true, value: { name: nameTok.text, value: value.value } };
}

/**
 * Parse a sequence of let-bindings followed by a body expression.
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed block node, or a structured error.
 */
function parseBlockBody(cursor: Cursor, input: string): ParseResult {
  const bindings: Binding[] = [];
  for (;;) {
    const kw = peek(cursor);
    if (kw.type !== "kw-let") {
      break;
    }
    cursor.index += 1;
    const binding = parseBinding(cursor, input);
    if (!binding.ok) {
      return binding;
    }
    bindings.push(binding.value);
  }
  const body = parseExpr(cursor, input);
  if (!body.ok) {
    return body;
  }
  return { ok: true, value: { kind: "block", bindings, body: body.value } };
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
 * Parse an expression (terms joined by + or -).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
function parseExpr(cursor: Cursor, input: string): ParseResult {
  return parseBinaryLevel(cursor, input, OPERATOR_PRECEDENCE["+"], parseTerm);
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
