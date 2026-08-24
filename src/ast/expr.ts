import type { Position } from "../errors.ts";

export enum ExprType {
  Number = "number",
  Boolean = "boolean",
  Identifier = "identifier",
  Unary = "unary",
  Ref = "ref",
  Deref = "deref",
  Binary = "binary",
  Array = "array",
  Index = "index",
  Call = "call",
}

export interface NumberExpr {
  readonly type: ExprType.Number;
  readonly value: number;
  readonly suffix?: string;
  readonly position: Position;
}

export interface BooleanExpr {
  readonly type: ExprType.Boolean;
  readonly value: boolean;
  readonly position: Position;
}

export interface IdentifierExpr {
  readonly type: ExprType.Identifier;
  readonly name: string;
  readonly position: Position;
}

export interface UnaryExpr {
  readonly type: ExprType.Unary;
  readonly op: string;
  readonly operand: Expr;
  readonly position: Position;
}

export interface RefExpr {
  readonly type: ExprType.Ref;
  readonly mutable: boolean;
  readonly operand: Expr;
  readonly position: Position;
}

export interface DerefExpr {
  readonly type: ExprType.Deref;
  readonly operand: Expr;
  readonly position: Position;
}

export interface BinaryExpr {
  readonly type: ExprType.Binary;
  readonly op: string;
  readonly left: Expr;
  readonly right: Expr;
  readonly position: Position;
}

export interface ArrayExpr {
  readonly type: ExprType.Array;
  readonly elements: readonly Expr[];
  readonly position: Position;
}

export interface IndexExpr {
  readonly type: ExprType.Index;
  readonly array: Expr;
  readonly index: Expr;
  readonly position: Position;
}

export interface CallExpr {
  readonly type: ExprType.Call;
  readonly callee: string;
  readonly args: readonly Expr[];
  readonly position: Position;
}

export type Expr =
  | NumberExpr
  | BooleanExpr
  | IdentifierExpr
  | UnaryExpr
  | RefExpr
  | DerefExpr
  | BinaryExpr
  | ArrayExpr
  | IndexExpr
  | CallExpr;
