/**
 * A numeric literal node.
 */
export interface NumNode {
  /** The node kind. */
  kind: "num";
  /** The numeric value. */
  value: number;
}

/**
 * A binary operation node.
 */
export interface BinOpNode {
  /** The node kind. */
  kind: "binop";
  /** The operator. */
  op: "+" | "-" | "*";
  /** The left operand. */
  left: AstNode;
  /** The right operand. */
  right: AstNode;
}

/**
 * A node in the expression AST.
 */
export type AstNode = NumNode | BinOpNode;
