import type { IntTypeName } from "./types";

/** A type expression (e.g., `U8`, `[I32; 3]`, `&Bool`, `{ x : I32, y : I32 }`). */
export type TypeNode =
  | { kind: "name"; name: string }
  | { kind: "array"; elementType: TypeNode; length: AstNode }
  | { kind: "ref"; innerType: TypeNode }
  | { kind: "struct"; fields: { name: string; type: TypeNode }[] }
  | { kind: "fn"; params: TypeNode[]; returnType: TypeNode }
  | { kind: "union"; types: TypeNode[] }
  | { kind: "enum"; name: string }
  | { kind: "tuple"; elementTypes: TypeNode[] };

/** Left-hand side of an assignment. */
export type LValue =
  | { kind: "var"; name: string }
  | { kind: "deref"; ref: LValue }
  | { kind: "index"; array: LValue; index: AstNode }
  | { kind: "field"; struct: LValue; field: string };

export type AstNode =
  | Num
  | Bool
  | Char
  | String
  | Null
  | Id
  | BinaryOp
  | UnaryOp
  | Let
  | Block
  | Ref
  | Deref
  | Assign
  | CompoundAssign
  | IfStatement
  | IfExpression
  | WhileLoop
  | BreakStatement
  | ContinueStatement
  | YieldStatement
  | ReturnStatement
  | ForLoop
  | Range
  | ArrayLiteral
  | ArrayIndex
  | StructLiteral
  | StructAccess
  | TupleLiteral
  | TupleAccess
  | TypeCheck
  | Cast
  | TypeAlias
  | StructDef
  | EnumDef
  | EnumAccess
  | MatchExpression
  | FnDef
  | FnCall
  | FnRef;

export interface Num {
  type: "num";
  value: number;
  numType?: IntTypeName;
  isFloat?: boolean;
}

export interface Bool {
  type: "bool";
  value: boolean;
}

export interface Char {
  type: "char";
  value: string;
}

export interface Null {
  type: "null";
}

export interface String {
  type: "string";
  value: string;
}

export interface Id {
  type: "id";
  name: string;
}

export interface BinaryOp {
  type: "binop";
  op:
    | "+"
    | "-"
    | "*"
    | "/"
    | "&&"
    | "||"
    | "=="
    | "<"
    | "<="
    | ">"
    | ">="
    | "!=";
  left: AstNode;
  right: AstNode;
}

export interface UnaryOp {
  type: "unop";
  op: "-";
  operand: AstNode;
}

export interface Let {
  type: "let";
  name: string;
  mutable: boolean;
  value: AstNode;
  typeAnnotation?: TypeNode;
}

export interface Block {
  type: "block";
  statements: AstNode[];
}

export interface Ref {
  type: "ref";
  name: string;
  mutable: boolean;
}

export interface Deref {
  type: "deref";
  operand: AstNode;
}

export interface Assign {
  type: "assign";
  lvalue: LValue;
  value: AstNode;
}

export interface CompoundAssign {
  type: "compoundassign";
  lvalue: LValue;
  op: "+" | "-";
  value: AstNode;
}

export interface IfStatement {
  type: "if-statement";
  condition: AstNode;
  thenBranch: AstNode;
  elseBranch: AstNode;
}

export interface IfExpression {
  type: "if-expression";
  condition: AstNode;
  thenBranch: AstNode;
  elseBranch: AstNode;
}

export interface WhileLoop {
  type: "while-loop";
  condition: AstNode;
  body: AstNode;
}

export interface BreakStatement {
  type: "break";
}

export interface ContinueStatement {
  type: "continue";
}

export interface YieldStatement {
  type: "yield";
  value: AstNode;
}

export interface ReturnStatement {
  type: "return";
  value: AstNode;
}

export interface Range {
  type: "range";
  start: AstNode;
  end: AstNode;
}

export interface ForLoop {
  type: "for-loop";
  variable: string;
  range: AstNode;
  body: AstNode;
}

export interface ArrayLiteral {
  type: "array-literal";
  elements: AstNode[];
}

export interface ArrayIndex {
  type: "array-index";
  array: AstNode;
  index: AstNode;
}

export interface StructLiteral {
  type: "struct-literal";
  fields: { name: string; value: AstNode }[];
}

export interface StructAccess {
  type: "struct-access";
  struct: AstNode;
  field: string;
}

export interface TypeCheck {
  type: "type-check";
  operand: AstNode;
  typeNode: TypeNode;
}
export interface TypeAlias {
  type: "type-alias";
  name: string;
  typeNode: TypeNode;
}
export interface TypeAlias {
  type: "type-alias";
  name: string;
  typeNode: TypeNode;
}

export interface StructDef {
  type: "struct-def";
  name: string;
  fields: { name: string; mutable: boolean; type: TypeNode }[];
}

export interface EnumDef {
  type: "enum-def";
  name: string;
  variants: string[];
}

export interface EnumAccess {
  type: "enum-access";
  enumName: string;
  variant: string;
}

export interface TupleLiteral {
  type: "tuple-literal";
  elements: AstNode[];
}

export interface TupleAccess {
  type: "tuple-access";
  tuple: AstNode;
  index: number;
}

export interface MatchExpression {
  type: "match";
  target: AstNode;
  cases: { pattern: AstNode | null; body: AstNode }[];
  // null pattern represents wildcard (_)
}

export interface Cast {
  type: "cast";
  expression: AstNode;
  typeName: IntTypeName;
}

export interface FnDef {
  type: "fn-def";
  name: string;
  params: { name: string; type: TypeNode }[];
  returnType: TypeNode;
  body: AstNode;
}

export interface FnCall {
  type: "fn-call";
  name: string;
  args: AstNode[];
}

export interface FnRef {
  type: "fnref";
  name: string;
}
