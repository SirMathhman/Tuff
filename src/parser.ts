import type { TuffError } from "./errors.ts";

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

/** A parsed tuff expression. */
export type TuffExpr = LiteralNode | IdentifierNode | OrNode | AndNode;

/** A mutable parse position over an expression string. */
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
    value.kind === "And"
  );
}

/**
 * Advance the position past any whitespace.
 * @param text {string} - The expression text.
 * @param pos {Pos} - The mutable parse position.
 * @returns {void} No return value.
 */
function skipSpaces(text: string, pos: Pos): void {
  while (pos.i < text.length && /\s/.test(text[pos.i] ?? "")) pos.i++;
}

/**
 * Parse a single operand: a number, a boolean, or an identifier.
 * @param text {string} - The expression text.
 * @param pos {Pos} - The mutable parse position, advanced past the operand.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The operand node, or a TuffError.
 */
function parseOperand(
  text: string,
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  skipSpaces(text, pos);
  if (text[pos.i] === "(") {
    pos.i++;
    const inner = parseOr(text, pos, line);
    if (!isExpr(inner)) return inner;
    skipSpaces(text, pos);
    if (text[pos.i] !== ")") {
      return { kind: "InvalidExpression", expression: text.trim(), line };
    }
    pos.i++;
    return inner;
  }
  const rest = text.slice(pos.i);
  const num = rest.match(/^-?\d+(\.\d+)?/);
  if (num) {
    pos.i += num[0].length;
    return { kind: "Literal", value: Number(num[0]) };
  }
  if (/^true\b/.test(rest)) {
    pos.i += 4;
    return { kind: "Literal", value: 1 };
  }
  if (/^false\b/.test(rest)) {
    pos.i += 5;
    return { kind: "Literal", value: 0 };
  }
  const ident = rest.match(/^\w+/);
  if (ident) {
    pos.i += ident[0].length;
    return { kind: "Identifier", name: ident[0] };
  }
  return { kind: "InvalidExpression", expression: text.trim(), line };
}

/**
 * Parse an expression at the `||` level, right-associative.
 * @param text {string} - The expression text.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
function parseOr(text: string, pos: Pos, line: number): TuffExpr | TuffError {
  const left = parseAnd(text, pos, line);
  if (!isExpr(left)) return left;
  skipSpaces(text, pos);
  if (text.startsWith("||", pos.i)) {
    pos.i += 2;
    const right = parseOr(text, pos, line);
    if (!isExpr(right)) return right;
    return { kind: "Or", left, right };
  }
  return left;
}

/**
 * Parse an expression at the `&&` level, right-associative.
 * @param text {string} - The expression text.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
function parseAnd(text: string, pos: Pos, line: number): TuffExpr | TuffError {
  const left = parseOperand(text, pos, line);
  if (!isExpr(left)) return left;
  skipSpaces(text, pos);
  if (text.startsWith("&&", pos.i)) {
    pos.i += 2;
    const right = parseAnd(text, pos, line);
    if (!isExpr(right)) return right;
    return { kind: "And", left, right };
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
  const pos: Pos = { i: 0 };
  skipSpaces(expr, pos);
  const node = parseOr(expr, pos, line);
  if (!isExpr(node)) return node;
  skipSpaces(expr, pos);
  if (pos.i !== expr.length) {
    return { kind: "InvalidExpression", expression: expr.trim(), line };
  }
  return node;
}
