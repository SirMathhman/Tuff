import type { TuffError } from "./errors.ts";
import type { TuffToken } from "./tokenizer.ts";
import type { Pos, TuffExpr } from "./ast.ts";
import { bool, num } from "./values.ts";

/** The node kinds of the binary operators, shared with the evaluator's rule table. */
export type BinaryNodeKind =
  | "Or"
  | "And"
  | "Add"
  | "Equal"
  | "Less"
  | "Range"
  | "Is";

/** A binary operator's grammar properties. */
interface BinaryOp {
  token: "Or" | "And" | "Plus" | "Equal" | "Less" | "DotDot" | "Is";
  node: BinaryNodeKind;
  assoc: "left" | "right";
}

/**
 * The binary operator grammar, loosest binding first.
 * Precedence and associativity are declared here, never by function order.
 */
const BINARY_OPS: BinaryOp[] = [
  { token: "DotDot", node: "Range", assoc: "left" },
  { token: "Or", node: "Or", assoc: "right" },
  { token: "And", node: "And", assoc: "right" },
  { token: "Equal", node: "Equal", assoc: "left" },
  { token: "Less", node: "Less", assoc: "left" },
  { token: "Plus", node: "Add", assoc: "left" },
  { token: "Is", node: "Is", assoc: "left" },
];

/**
 * Type guard distinguishing a parsed expression node from an error.
 * @param value {TuffExpr | TuffError} - The value to test.
 * @returns {boolean} True if the value is an expression node.
 */
export function isExpr(value: TuffExpr | TuffError): value is TuffExpr {
  if (
    value.kind === "Literal" ||
    value.kind === "Identifier" ||
    value.kind === "Ref" ||
    value.kind === "Deref" ||
    value.kind === "Tuple" ||
    value.kind === "TupleIndex" ||
    value.kind === "Array" ||
    value.kind === "ArrayIndex"
  ) {
    return true;
  }
  return BINARY_OPS.some((op) => op.node === value.kind);
}

/**
 * Parse the tail of a tuple or array literal: the first element is already
 * parsed and the first comma is the next token.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the literal.
 * @param line {number} - The 1-based line number.
 * @param first {TuffExpr} - The already-parsed first element.
 * @param close {"RParen" | "RBracket"} - The expected closing token kind.
 * @param node {"Tuple" | "Array"} - The node kind to build.
 * @returns {TuffExpr | TuffError} The Tuple or Array node, or a TuffError.
 */
function parseElementList(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  first: TuffExpr,
  close: "RParen" | "RBracket",
  node: "Tuple" | "Array",
): TuffExpr | TuffError {
  const elements: TuffExpr[] = [first];
  while (tokens[pos.i]?.kind === "Comma") {
    pos.i++;
    const element = parseLevel(tokens, pos, line, 0);
    if (!isExpr(element)) return element;
    elements.push(element);
  }
  const closeTok = tokens[pos.i];
  if (closeTok?.kind !== close) {
    return { kind: "InvalidExpression", expression: "", line };
  }
  pos.i++;
  return { kind: node, elements };
}

/**
 * Parse a single operand: a literal, an identifier, a parenthesized
 * expression, a tuple literal, or an array literal, followed by any `.N`
 * tuple-index and `[e]` array-index suffixes.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the operand.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The operand node, or a TuffError.
 */
export function parseOperand(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const operand = parsePrimary(tokens, pos, line);
  if (!isExpr(operand)) return operand;
  let left: TuffExpr = operand;
  for (;;) {
    if (tokens[pos.i]?.kind === "Dot" && tokens[pos.i + 1]?.kind !== "Dot") {
      pos.i++;
      const indexTok = tokens[pos.i];
      if (indexTok?.kind !== "Number" || !Number.isInteger(indexTok.value)) {
        return { kind: "InvalidExpression", expression: "", line };
      }
      pos.i++;
      left = { kind: "TupleIndex", operand: left, index: indexTok.value };
      continue;
    }
    if (tokens[pos.i]?.kind === "LBracket") {
      pos.i++;
      const index = parseIndexSuffix(tokens, pos, line);
      if (!isExpr(index)) return index;
      left = { kind: "ArrayIndex", operand: left, index };
      continue;
    }
    break;
  }
  return left;
}

/**
 * Parse the tail of an `[e]` array-index suffix: the `[` is already consumed.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the suffix.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The index expression, or a TuffError.
 */
export function parseIndexSuffix(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const index = parseLevel(tokens, pos, line, 0);
  if (!isExpr(index)) return index;
  const close = tokens[pos.i];
  if (close?.kind !== "RBracket") {
    return { kind: "InvalidExpression", expression: "", line };
  }
  pos.i++;
  return index;
}

/**
 * Parse the tail of a `&`/`&mut` reference: the `&` is already consumed.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the reference.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The Ref node, or a TuffError.
 */
function parseRef(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  let mut = false;
  const mutTok = tokens[pos.i];
  if (mutTok?.kind === "Ident" && mutTok.name === "mut") {
    mut = true;
    pos.i++;
  }
  const operand = parseOperand(tokens, pos, line);
  if (!isExpr(operand)) return operand;
  return { kind: "Ref", mut, operand };
}

/**
 * Parse a primary operand: a literal, an identifier, a parenthesized
 * expression, or a tuple literal.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the operand.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The operand node, or a TuffError.
 */
function parsePrimary(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const token = tokens[pos.i];
  if (!token) return { kind: "InvalidExpression", expression: "", line };
  if (token.kind === "Number" || token.kind === "Bool") {
    pos.i++;
    const value =
      token.kind === "Number" ? num(token.value) : bool(token.value !== 0);
    return {
      kind: "Literal",
      value,
      suffix: token.kind === "Number" ? token.suffix : undefined,
    };
  }
  if (token.kind === "Ref") {
    pos.i++;
    return parseRef(tokens, pos, line);
  }
  if (token.kind === "Deref") {
    pos.i++;
    const operand = parseOperand(tokens, pos, line);
    if (!isExpr(operand)) return operand;
    return { kind: "Deref", operand };
  }
  if (token.kind === "Ident") {
    pos.i++;
    return { kind: "Identifier", name: token.name };
  }
  if (token.kind === "LParen") {
    pos.i++;
    const first = parseLevel(tokens, pos, line, 0);
    if (!isExpr(first)) return first;
    if (tokens[pos.i]?.kind === "Comma") {
      return parseElementList(tokens, pos, line, first, "RParen", "Tuple");
    }
    const close = tokens[pos.i];
    if (close?.kind !== "RParen") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    return first;
  }
  if (token.kind === "LBracket") {
    pos.i++;
    if (tokens[pos.i]?.kind === "RBracket") {
      pos.i++;
      return { kind: "Array", elements: [] };
    }
    const first = parseLevel(tokens, pos, line, 0);
    if (!isExpr(first)) return first;
    if (tokens[pos.i]?.kind === "RBracket") {
      pos.i++;
      return { kind: "Array", elements: [first] };
    }
    return parseElementList(tokens, pos, line, first, "RBracket", "Array");
  }
  return { kind: "InvalidExpression", expression: "", line };
}

/**
 * Parse an expression at one precedence level of the binary operator grammar.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @param level {number} - The index into BINARY_OPS; the next level binds tighter.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
export function parseLevel(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  level: number,
): TuffExpr | TuffError {
  const op = BINARY_OPS[level];
  if (!op) return parseOperand(tokens, pos, line);
  const first = parseLevel(tokens, pos, line, level + 1);
  if (!isExpr(first)) return first;
  let left: TuffExpr = first;
  while (tokens[pos.i]?.kind === op.token) {
    pos.i++;
    const right =
      op.assoc === "right"
        ? parseLevel(tokens, pos, line, level)
        : parseLevel(tokens, pos, line, level + 1);
    if (!isExpr(right)) return right;
    left = { kind: op.node, left, right };
  }
  return left;
}
