import { OPERATOR_PRECEDENCE } from "./ast.ts";
import type { AstNode, Operator } from "./ast.ts";
import { tokenize } from "./tokenizer.ts";
import type { Token } from "./tokenizer.ts";
import { isBlockStart, peek } from "./cursor.ts";
import type { Cursor } from "./cursor.ts";
import { expectClose, parseBlock, parseBlockBody } from "./statements.ts";
import type { ParseResult } from "./statements.ts";

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
    return { ok: true, value: { kind: "bool", value: tok.type === "kw-true" } };
  }
  if (tok.type === "kw-if") {
    return parseIf(cursor, input);
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
 * Parse an if expression: `if (cond) then else alt`.
 * @param {Cursor} cursor - The token cursor, positioned at the if keyword.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed if node, or a structured error.
 */
function parseIf(cursor: Cursor, input: string): ParseResult {
  cursor.index += 1;
  const open = peek(cursor);
  if (open.type !== "lparen") {
    return {
      ok: false,
      error: { kind: "syntax", input, position: open.position },
    };
  }
  cursor.index += 1;
  const condition = parseExpr(cursor, input);
  if (!condition.ok) {
    return condition;
  }
  const close = expectClose(cursor, input, "rparen");
  if (!close.ok) {
    return close;
  }
  const then = parseExpr(cursor, input);
  if (!then.ok) {
    return then;
  }
  const elseKw = peek(cursor);
  if (elseKw.type !== "kw-else") {
    return {
      ok: false,
      error: { kind: "syntax", input, position: elseKw.position },
    };
  }
  cursor.index += 1;
  const alt = parseExpr(cursor, input);
  if (!alt.ok) {
    return alt;
  }
  return {
    ok: true,
    value: {
      kind: "if",
      condition: condition.value,
      then: then.value,
      else: alt.value,
    },
  };
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
 * The distinct precedence levels, tightest first, derived from the operator table.
 */
const PRECEDENCE_LEVELS: number[] = [
  ...new Set(Object.values(OPERATOR_PRECEDENCE)),
].sort((a, b) => b - a);

/**
 * A parser for one precedence level.
 */
type LevelParser = (cursor: Cursor, input: string) => ParseResult;

/**
 * The chain of level parsers, tightest first. The tightest level parses factors;
 * each looser level parses the level above it as its operand.
 */
const LEVEL_PARSERS: LevelParser[] = PRECEDENCE_LEVELS.reduce<LevelParser[]>(
  (chain, level) => {
    const operand = chain.length === 0 ? parseFactor : chain[chain.length - 1]!;
    chain.push((cursor, input) =>
      parseBinaryLevel(cursor, input, level, operand),
    );
    return chain;
  },
  [],
);

/**
 * Parse a full expression (the loosest precedence level).
 * @param {Cursor} cursor - The token cursor.
 * @param {string} input - The original input.
 * @returns {ParseResult} The parsed AST, or a structured error.
 */
function parseExpr(cursor: Cursor, input: string): ParseResult {
  return LEVEL_PARSERS[LEVEL_PARSERS.length - 1]!(cursor, input);
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
