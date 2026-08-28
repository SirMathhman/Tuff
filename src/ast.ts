/**
 * A binary operator.
 */
export type Operator = "+" | "-" | "*";

/**
 * The precedence of each operator (higher binds tighter).
 */
export const OPERATOR_PRECEDENCE: Record<Operator, number> = {
  "*": 2,
  "+": 1,
  "-": 1,
};

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
  op: Operator;
  /** The left operand. */
  left: AstNode;
  /** The right operand. */
  right: AstNode;
}

/**
 * A variable reference node.
 */
export interface IdentNode {
  /** The node kind. */
  kind: "ident";
  /** The variable name. */
  name: string;
}

/**
 * A variable binding in a block.
 */
export interface Binding {
  /** The variable name. */
  name: string;
  /** The initializer expression. */
  value: AstNode;
}

/**
 * A block node with let-bindings and a body expression.
 */
export interface BlockNode {
  /** The node kind. */
  kind: "block";
  /** The variable bindings. */
  bindings: Binding[];
  /** The body expression. */
  body: AstNode;
}

/**
 * A node in the expression AST.
 */
export type AstNode = NumNode | BinOpNode | IdentNode | BlockNode;
