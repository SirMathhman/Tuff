import type { Span } from "./span.ts";

/** The kinds of AST node. */
export enum NodeKind {
  Literal = "Literal",
  Name = "Name",
  Chain = "Chain",
  Block = "Block",
}

/** The binary operators. */
export enum Operator {
  Add = "+",
  Subtract = "-",
  Multiply = "*",
  Divide = "/",
}

/** A numeric literal. */
export interface LiteralNode {
  kind: NodeKind.Literal;
  value: number;
  span: Span;
}

/** A reference to a bound name. */
export interface NameNode {
  kind: NodeKind.Name;
  name: string;
  span: Span;
}

/** One operator and its right-hand operand within a chain. */
export interface ChainStep {
  operator: Operator;
  operatorSpan: Span;
  operand: Expr;
}

/** A left-to-right sequence of one precedence level, e.g. `a + b - c`. */
export interface ChainNode {
  kind: NodeKind.Chain;
  first: Expr;
  steps: ChainStep[];
}

/** A `let NAME = value;` statement. */
export interface Binding {
  name: string;
  span: Span;
  value: Expr;
}

/** Zero or more bindings followed by one final expression. */
export interface BlockNode {
  kind: NodeKind.Block;
  bindings: Binding[];
  result: Expr;
}

/** Any expression node. */
export type Expr = LiteralNode | NameNode | ChainNode | BlockNode;
