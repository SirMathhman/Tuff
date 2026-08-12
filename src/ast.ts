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
  | Range;

export interface Num {
  type: "num";
  value: number;
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
