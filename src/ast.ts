import type { Span } from "./span.ts";

export enum NodeKind {
  Literal = "Literal",
  Name = "Name",
  Chain = "Chain",
  Block = "Block",
}

export enum Operator {
  Add = "+",
  Subtract = "-",
  Multiply = "*",
  Divide = "/",
}

export interface LiteralNode {
  kind: NodeKind.Literal;
  value: number;
  span: Span;
}

export interface NameNode {
  kind: NodeKind.Name;
  name: string;
  span: Span;
}

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

export interface Binding {
  name: string;
  span: Span;
  value: Expr;
}

export interface BlockNode {
  kind: NodeKind.Block;
  bindings: Binding[];
  result: Expr;
}

export type Expr = LiteralNode | NameNode | ChainNode | BlockNode;
