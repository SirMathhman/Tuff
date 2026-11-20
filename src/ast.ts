import type { Span } from "./span.ts";

/** The kinds of AST node. */
export enum NodeKind {
  /** A numeric literal. */
  Literal = "Literal",
  /** A reference to a bound name. */
  Name = "Name",
  /** A chain of operators at one precedence level. */
  Chain = "Chain",
  /** A block: bindings followed by a final expression. */
  Block = "Block",
}

/** The binary operators. */
export enum Operator {
  /** Addition. */
  Add = "+",
  /** Subtraction. */
  Subtract = "-",
  /** Multiplication. */
  Multiply = "*",
  /** Integer division, truncated toward zero. */
  Divide = "/",
}

/** A numeric literal. */
export interface LiteralNode {
  /** Always `NodeKind.Literal`. */
  kind: NodeKind.Literal;
  /** The literal's value. */
  value: number;
  /** Where the literal sits in the source. */
  span: Span;
}

/** A reference to a bound name. */
export interface NameNode {
  /** Always `NodeKind.Name`. */
  kind: NodeKind.Name;
  /** The referenced name. */
  name: string;
  /** Where the name sits in the source. */
  span: Span;
}

/** One operator and its right-hand operand within a chain. */
export interface ChainStep {
  /** The operator applied. */
  operator: Operator;
  /** Where the operator sits in the source; operator errors point here. */
  operatorSpan: Span;
  /** The right-hand operand. */
  operand: Expr;
}

/** A left-to-right sequence of one precedence level, e.g. `a + b - c`. */
export interface ChainNode {
  /** Always `NodeKind.Chain`. */
  kind: NodeKind.Chain;
  /** The leftmost operand. */
  first: Expr;
  /** The operators and their right-hand operands, in source order. */
  steps: ChainStep[];
}

/** A `let NAME = value;` statement. */
export interface Binding {
  /** The name being bound. */
  name: string;
  /** Where the name sits in the source. */
  span: Span;
  /** The expression whose value is bound. */
  value: Expr;
}

/** Zero or more bindings followed by one final expression. */
export interface BlockNode {
  /** Always `NodeKind.Block`. */
  kind: NodeKind.Block;
  /** The `let` statements, in source order. */
  bindings: Binding[];
  /** The expression whose value is the block's value. */
  result: Expr;
}

/** Any expression node. */
export type Expr = LiteralNode | NameNode | ChainNode | BlockNode;
