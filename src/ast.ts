// ── AST Types ──────────────────────────────────────────────────────────────

import type { Type } from "./types";
import type { Position } from "./errors";

export interface Program {
  type: "Program";
  body: Statement[];
}

export interface Node {
  loc?: Position;
}

export type Statement =
  | ExprStatement
  | LetStatement
  | AssignStatement
  | CompoundAssignStatement
  | DerefAssignStatement
  | BlockStatement
  | IfStatement
  | WhileStatement
  | FunctionDefStatement
  | StructDefStatement;

export interface StructField {
  name: string;
  typeAnnotation: Type | null;
  loc?: Position;
}

export interface StructDefStatement extends Node {
  type: "StructDefStatement";
  name: string;
  fields: StructField[];
}

export interface FunctionParam {
  name: string;
  typeAnnotation: Type | null;
  loc?: Position;
}

export interface FunctionDefStatement extends Node {
  type: "FunctionDefStatement";
  name: string;
  params: FunctionParam[];
  returnAnnotation: Type | null;
  body: Expr;
}

export interface ExprStatement extends Node {
  type: "ExprStatement";
  expression: Expr;
}

export interface LetStatement extends Node {
  type: "LetStatement";
  mutable: boolean;
  name: string;
  typeAnnotation: Type | null;
  value: Expr;
}

export interface AssignStatement extends Node {
  type: "AssignStatement";
  name: string;
  value: Expr;
}

export interface CompoundAssignStatement extends Node {
  type: "CompoundAssignStatement";
  name: string;
  op: string;
  value: Expr;
}

export interface DerefAssignStatement extends Node {
  type: "DerefAssignStatement";
  target: Expr;
  value: Expr;
}

export interface BlockStatement extends Node {
  type: "BlockStatement";
  body: Statement[];
}

export interface IfStatement extends Node {
  type: "IfStatement";
  condition: Expr;
  thenBranch: Statement;
  elseBranch: Statement | null;
}

export interface WhileStatement extends Node {
  type: "WhileStatement";
  condition: Expr;
  body: Statement;
}

export type Expr =
  | BinaryExpr
  | NumberLiteral
  | Identifier
  | BooleanLiteral
  | CallExpr
  | StructLiteral
  | FieldAccess
  | RefExpr
  | DerefExpr
  | UnaryExpr;

export interface UnaryExpr extends Node {
  type: "UnaryExpr";
  op: "-";
  operand: Expr;
}

export interface StructLiteral extends Node {
  type: "StructLiteral";
  structName: string;
  fields: { name: string; value: Expr; loc?: Position }[];
}

export interface FieldAccess extends Node {
  type: "FieldAccess";
  object: Expr;
  field: string;
}

export interface CallExpr extends Node {
  type: "CallExpr";
  name: string;
  arguments: Expr[];
}

export interface BinaryExpr extends Node {
  type: "BinaryExpr";
  left: Expr;
  op: string;
  right: Expr;
}

export interface NumberLiteral extends Node {
  type: "NumberLiteral";
  value: number;
  typeAnnotation: Type | null;
}

export interface Identifier extends Node {
  type: "Identifier";
  name: string;
}

export interface BooleanLiteral extends Node {
  type: "BooleanLiteral";
  value: boolean;
}

export interface RefExpr extends Node {
  type: "RefExpr";
  operand: Expr;
  mutable: boolean;
}

export interface DerefExpr extends Node {
  type: "DerefExpr";
  operand: Expr;
}

// ── Runtime Value Types ────────────────────────────────────────────────────

export interface StructValue {
  [key: string]: number | StructValue;
}

export interface RefValue {
  __ref: true;
  name: string;
  mutable: boolean;
}

export function isRefValue(v: number | StructValue | RefValue): v is RefValue {
  return typeof v === "object" && "__ref" in v;
}
