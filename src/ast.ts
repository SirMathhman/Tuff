/**
 * A binary operator.
 */
export type Operator = "+" | "-" | "*" | "||" | "&&" | "==";

/**
 * The precedence of each operator (higher binds tighter).
 */
export const OPERATOR_PRECEDENCE: Record<Operator, number> = {
  "*": 4,
  "+": 3,
  "-": 3,
  "==": 2,
  "&&": 1,
  "||": 0,
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
 * A boolean literal node.
 */
export interface BoolNode {
  /** The node kind. */
  kind: "bool";
  /** The boolean value. */
  value: boolean;
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
  /** Whether the binding can be reassigned. */
  mutable: boolean;
  /** The initializer expression. */
  value: AstNode;
}

/**
 * An assignment statement in a block.
 */
export interface Assign {
  /** The variable name. */
  name: string;
  /** The value expression. */
  value: AstNode;
}

/**
 * An assignment through a dereference in a block.
 */
export interface DerefAssign {
  /** The target expression (a dereference). */
  target: AstNode;
  /** The value expression. */
  value: AstNode;
}

/**
 * A statement in a block body.
 */
export type Statement = Binding | Assign | DerefAssign;

/**
 * A block node with statements and a body expression.
 */
export interface BlockNode {
  /** The node kind. */
  kind: "block";
  /** The statements (bindings and assignments). */
  statements: Statement[];
  /** The body expression. */
  body: AstNode;
}

/**
 * A reference (address-of) node.
 */
export interface RefNode {
  /** The node kind. */
  kind: "ref";
  /** Whether the reference allows mutation through it. */
  mutable: boolean;
  /** The target expression (must be an identifier). */
  target: AstNode;
}

/**
 * A dereference node.
 */
export interface DerefNode {
  /** The node kind. */
  kind: "deref";
  /** The target expression (must evaluate to a reference). */
  target: AstNode;
}

/**
 * A node in the expression AST.
 */
export type AstNode =
  | NumNode
  | BoolNode
  | BinOpNode
  | IdentNode
  | BlockNode
  | RefNode
  | DerefNode;
