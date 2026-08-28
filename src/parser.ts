import { OPERATOR_PRECEDENCE } from "./ast.ts";
import type { AstNode, Operator } from "./ast.ts";

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
 * A token produced by the tokenizer.
 */
interface Token {
  /** The token kind. */
  type: "num" | "op" | "invalid" | "eof";
  /** The token text. */
  text: string;
  /** The position of the token in the input. */
  position: number;
}

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
 * Tokenize an expression into a list of tokens.
 * @param {string} input - The expression to tokenize.
 * @returns {Token[]} The list of tokens, ending with an eof token.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === " ") {
      i += 1;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < input.length && input[j]! >= "0" && input[j]! <= "9") {
        j += 1;
      }
      tokens.push({ type: "num", text: input.slice(i, j), position: i });
      i = j;
      continue;
    }
    if (ch in OPERATOR_PRECEDENCE) {
      tokens.push({ type: "op", text: ch, position: i });
      i += 1;
      continue;
    }
    tokens.push({ type: "invalid", text: ch, position: i });
    i += 1;
  }
  tokens.push({ type: "eof", text: "", position: i });
  return tokens;
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
  const kind = tok.type === "invalid" ? "invalid-number" : "syntax";
  return { ok: false, error: { kind, input, position: tok.position } };
}

/**
 * Parse a term (factors joined by *).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
function parseTerm(cursor: Cursor, input: string): ParseResult {
  const left = parseFactor(cursor, input);
  if (!left.ok) {
    return left;
  }
  let node: AstNode = left.value;
  for (;;) {
    const opTok = peek(cursor);
    if (opTok.type !== "op" || OPERATOR_PRECEDENCE[opTok.text as Operator] !== 2) {
      break;
    }
    cursor.index += 1;
    const right = parseFactor(cursor, input);
    if (!right.ok) {
      return right;
    }
    node = { kind: "binop", op: opTok.text as Operator, left: node, right: right.value };
  }
  return { ok: true, value: node };
}

/**
 * Parse an expression (terms joined by + or -).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
function parseExpr(cursor: Cursor, input: string): ParseResult {
  const left = parseTerm(cursor, input);
  if (!left.ok) {
    return left;
  }
  let node: AstNode = left.value;
  for (;;) {
    const opTok = peek(cursor);
    if (opTok.type !== "op" || OPERATOR_PRECEDENCE[opTok.text as Operator] !== 1) {
      break;
    }
    cursor.index += 1;
    const right = parseTerm(cursor, input);
    if (!right.ok) {
      return right;
    }
    node = { kind: "binop", op: opTok.text as Operator, left: node, right: right.value };
  }
  return { ok: true, value: node };
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
  const result = parseExpr(cursor, expression);
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
