import { OPERATOR_PRECEDENCE } from "./ast.ts";
import type { AstNode, Operator } from "./ast.ts";
import { tokenize } from "./tokenizer.ts";
import type { Token } from "./tokenizer.ts";
import {
  expectClose,
  isBlockStart,
  parseBlock,
  parseBlockBody,
  peek,
} from "./statements.ts";
import type { Cursor, ParseResult } from "./statements.ts";

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
      return parseBlock(cursor, input, closeType, parseExpr, parseFactor);
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
  const result = parseBlockBody(cursor, expression, parseExpr, parseFactor);
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
