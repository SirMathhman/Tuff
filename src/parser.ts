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

/** A binary `==` expression node. */
export interface EqualNode {
  kind: "Equal";
  left: TuffExpr;
  right: TuffExpr;
}

/** A parsed tuff expression. */
export type TuffExpr =
  | LiteralNode
  | IdentifierNode
  | OrNode
  | AndNode
  | AddNode
  | EqualNode;

/** A mutable parse position over a token list. */
interface Pos {
  i: number;
}

/** A binary operator's grammar properties. */
interface BinaryOp {
  token: "Or" | "And" | "Plus" | "Equal";
  node: "Or" | "And" | "Add" | "Equal";
  assoc: "left" | "right";
}

/**
 * The binary operator grammar, loosest binding first.
 * Precedence and associativity are declared here, never by function order.
 */
const BINARY_OPS: BinaryOp[] = [
  { token: "Or", node: "Or", assoc: "right" },
  { token: "And", node: "And", assoc: "right" },
  { token: "Equal", node: "Equal", assoc: "left" },
  { token: "Plus", node: "Add", assoc: "left" },
];

/**
 * Type guard distinguishing a parsed expression node from an error.
 * @param value {TuffExpr | TuffError} - The value to test.
 * @returns {boolean} True if the value is an expression node.
 */
export function isExpr(value: TuffExpr | TuffError): value is TuffExpr {
  if (value.kind === "Literal" || value.kind === "Identifier") return true;
  return BINARY_OPS.some((op) => op.node === value.kind);
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
    const inner = parseLevel(tokens, pos, line, 0);
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
 * Parse an expression at one precedence level of the binary operator grammar.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @param level {number} - The index into BINARY_OPS; the next level binds tighter.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
function parseLevel(
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
  const node = parseLevel(tokens, pos, line, 0);
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
