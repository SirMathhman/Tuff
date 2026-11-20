import type { Span } from "./span.ts";

/** The kinds of AST node. */
export enum NodeKind {
  /** A numeric literal. */
  Literal = "Literal",
  /** A reference to a bound name. */
  Name = "Name",
  /** A chain of operators at one precedence level. */
  Chain = "Chain",
  /** A block: statements followed by a final expression. */
  Block = "Block",
  /** A boolean literal, `true` or `false`. */
  Boolean = "Boolean",
  /** A borrow, `&x` or `&mut x`, that produces a reference to a binding. */
  Borrow = "Borrow",
  /** A dereference, `*x`, that reads the value a reference points to. */
  Deref = "Deref",
}

/** The kinds of statement that may appear in a block. */
export enum StatementKind {
  /** A `let` statement that binds a name. */
  Let = "Let",
  /** An assignment that changes a `let mut` binding. */
  Assign = "Assign",
  /** An assignment through a mutable reference, `*x = value;`. */
  AssignThrough = "AssignThrough",
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

/** A boolean literal. */
export interface BooleanNode {
  /** Always `NodeKind.Boolean`. */
  kind: NodeKind.Boolean;
  /** The literal's value. */
  value: boolean;
  /** Where the literal sits in the source. */
  span: Span;
}

/** A borrow of a binding: `&x` (shared) or `&mut x` (mutable). */
export interface BorrowNode {
  /** Always `NodeKind.Borrow`. */
  kind: NodeKind.Borrow;
  /** Whether the borrow is mutable (`&mut`). */
  mutable: boolean;
  /** The borrowed name, located in the source. */
  target: NameNode;
  /** Where the `&` sits in the source. */
  span: Span;
}

/** A dereference of a reference: `*x`. */
export interface DerefNode {
  /** Always `NodeKind.Deref`. */
  kind: NodeKind.Deref;
  /** The name whose reference is read, located in the source. */
  target: NameNode;
  /** Where the `*` sits in the source. */
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

/** A `let NAME = value;` or `let mut NAME = value;` statement. */
export interface LetStatement {
  /** Always `StatementKind.Let`. */
  kind: StatementKind.Let;
  /** The name being bound. */
  name: string;
  /** Where the name sits in the source. */
  span: Span;
  /** Whether the binding may later be assigned (`let mut`). */
  mutable: boolean;
  /** The expression whose value is bound. */
  value: Expr;
}

/** An assignment statement `NAME = value;` that changes a `let mut` binding. */
export interface AssignStatement {
  /** Always `StatementKind.Assign`. */
  kind: StatementKind.Assign;
  /** The name being assigned, located in the source. */
  target: NameNode;
  /** The new value. */
  value: Expr;
}

/** An assignment through a reference, `*x = value;`. */
export interface AssignThroughStatement {
  /** Always `StatementKind.AssignThrough`. */
  kind: StatementKind.AssignThrough;
  /** Where the `*` sits in the source. */
  span: Span;
  /** The name of the reference being written through, located in the source. */
  target: NameNode;
  /** The new value. */
  value: Expr;
}

/** A statement inside a block. */
export type Statement = LetStatement | AssignStatement | AssignThroughStatement;

/** Zero or more statements followed by one final expression. */
export interface BlockNode {
  /** Always `NodeKind.Block`. */
  kind: NodeKind.Block;
  /** The statements, in source order. */
  statements: Statement[];
  /** The expression whose value is the block's value, or `undefined` when the block ends in a statement; such a block evaluates to 0. */
  result: Expr | undefined;
}

/** Any expression node. */
export type Expr = LiteralNode | BooleanNode | NameNode | BorrowNode | DerefNode | ChainNode | BlockNode;
