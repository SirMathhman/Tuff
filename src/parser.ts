import type { TuffError } from "./errors.ts";
import { tokenize, type TuffToken } from "./tokenizer.ts";

/** A literal expression node (number or boolean). */
export interface LiteralNode {
  kind: "Literal";
  value: number;
}

/** An identifier expression node. */
export interface IdentifierNode {
  kind: "Identifier";
  name: string;
}

/** A binary `||` expression node. */
export interface OrNode {
  kind: "Or";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `&&` expression node. */
export interface AndNode {
  kind: "And";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `+` expression node. */
export interface AddNode {
  kind: "Add";
  left: TuffExpr;
  right: TuffExpr;
}

/** A parsed tuff expression. */
export type TuffExpr =
  | LiteralNode
  | IdentifierNode
  | OrNode
  | AndNode
  | AddNode;

/** A mutable parse position over a token list. */
interface Pos {
  i: number;
}

/**
 * Type guard distinguishing a parsed expression node from an error.
 * @param value {TuffExpr | TuffError} - The value to test.
 * @returns {boolean} True if the value is an expression node.
 */
export function isExpr(value: TuffExpr | TuffError): value is TuffExpr {
  return (
    value.kind === "Literal" ||
    value.kind === "Identifier" ||
    value.kind === "Or" ||
    value.kind === "And" ||
    value.kind === "Add"
  );
}

/**
 * Parse a single operand: a literal, an identifier, or a parenthesized expression.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the operand.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The operand node, or a TuffError.
 */
function parseOperand(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const token = tokens[pos.i];
  if (!token) return { kind: "InvalidExpression", expression: "", line };
  if (token.kind === "Number" || token.kind === "Bool") {
    pos.i++;
    return { kind: "Literal", value: token.value };
  }
  if (token.kind === "Ident") {
    pos.i++;
    return { kind: "Identifier", name: token.name };
  }
  if (token.kind === "LParen") {
    pos.i++;
    const inner = parseOr(tokens, pos, line);
    if (!isExpr(inner)) return inner;
    const close = tokens[pos.i];
    if (close?.kind !== "RParen") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    return inner;
  }
  return { kind: "InvalidExpression", expression: "", line };
}

/**
 * Parse an expression at the `||` level, right-associative.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
function parseOr(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const left = parseAnd(tokens, pos, line);
  if (!isExpr(left)) return left;
  if (tokens[pos.i]?.kind === "Or") {
    pos.i++;
    const right = parseOr(tokens, pos, line);
    if (!isExpr(right)) return right;
    return { kind: "Or", left, right };
  }
  return left;
}

/**
 * Parse an expression at the `&&` level, right-associative.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
function parseAnd(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const left = parseAdd(tokens, pos, line);
  if (!isExpr(left)) return left;
  if (tokens[pos.i]?.kind === "And") {
    pos.i++;
    const right = parseAnd(tokens, pos, line);
    if (!isExpr(right)) return right;
    return { kind: "And", left, right };
  }
  return left;
}

/**
 * Parse an expression at the `+` level, left-associative.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
function parseAdd(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const first = parseOperand(tokens, pos, line);
  if (!isExpr(first)) return first;
  let left: TuffExpr = first;
  while (tokens[pos.i]?.kind === "Plus") {
    pos.i++;
    const right = parseOperand(tokens, pos, line);
    if (!isExpr(right)) return right;
    left = { kind: "Add", left, right };
  }
  return left;
}

/**
 * Parse a full expression string into an AST.
 * @param expr {string} - The expression text.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The parsed expression, or a TuffError.
 */
export function parseExpression(
  expr: string,
  line: number,
): TuffExpr | TuffError {
  let tokens: TuffToken[];
  try {
    tokens = tokenize(expr);
  } catch {
    return { kind: "InvalidExpression", expression: expr.trim(), line };
  }
  const pos: Pos = { i: 0 };
  const node = parseOr(tokens, pos, line);
  if (!isExpr(node)) {
    if (node.kind === "InvalidExpression") {
      return { kind: "InvalidExpression", expression: expr.trim(), line };
    }
    return node;
  }
  if (pos.i !== tokens.length) {
    return { kind: "InvalidExpression", expression: expr.trim(), line };
  }
  return node;
}
