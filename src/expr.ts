import type { TuffError } from "./errors.ts";
import type { TuffToken } from "./tokenizer.ts";
import type { Pos, TuffExpr } from "./ast.ts";
import { bool, num } from "./values.ts";

/** The node kinds of the binary operators, shared with the evaluator's rule table. */
export type BinaryNodeKind = "Or" | "And" | "Add" | "Equal" | "Less";

/** A binary operator's grammar properties. */
interface BinaryOp {
  token: "Or" | "And" | "Plus" | "Equal" | "Less";
  node: BinaryNodeKind;
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
  { token: "Less", node: "Less", assoc: "left" },
  { token: "Plus", node: "Add", assoc: "left" },
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
    value.kind === "Deref"
  ) {
    return true;
  }
  return BINARY_OPS.some((op) => op.node === value.kind);
}

/**
 * Parse a single operand: a literal, an identifier, or a parenthesized expression.
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
  const token = tokens[pos.i];
  if (!token) return { kind: "InvalidExpression", expression: "", line };
  if (token.kind === "Number" || token.kind === "Bool") {
    pos.i++;
    const value =
      token.kind === "Number" ? num(token.value) : bool(token.value !== 0);
    return { kind: "Literal", value };
  }
  if (token.kind === "Ref") {
    pos.i++;
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
