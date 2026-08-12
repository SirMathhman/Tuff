import type { IntTypeName } from "./types";

export type AstNode =
  | Num
  | Bool
  | Id
  | BinaryOp
  | UnaryOp
  | Let
  | Block
  | Ref
  | Deref
  | Assign
  | DerefAssign
  | CompoundAssign
  | IfStatement
  | IfExpression
  | WhileLoop
  | BreakStatement
  | ContinueStatement
  | ForLoop
  | Range
  | ArrayLiteral
  | ArrayIndex
  | StructLiteral
  | StructAccess
  | TypeCheck
  | Cast;

export interface Num {
  type: "num";
  value: number;
  numType?: IntTypeName;
}

export interface Bool {
  type: "bool";
  value: boolean;
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
  typeAnnotation?: string;
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
  name: string;
  value: AstNode;
}

export interface DerefAssign {
  type: "derefassign";
  target: AstNode;
  value: AstNode;
}

export interface CompoundAssign {
  type: "compoundassign";
  name: string;
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
  typeName: string;
}

export interface Cast {
  type: "cast";
  expression: AstNode;
  typeName: IntTypeName;
}
