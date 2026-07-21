// ── AST Types ──────────────────────────────────────────────────────────────

export interface Program {
  type: "Program";
  body: Statement[];
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
  typeAnnotation: string | null;
}

export interface StructDefStatement {
  type: "StructDefStatement";
  name: string;
  fields: StructField[];
}

export interface FunctionParam {
  name: string;
  typeAnnotation: string | null;
}

export interface FunctionDefStatement {
  type: "FunctionDefStatement";
  name: string;
  params: FunctionParam[];
  returnAnnotation: string | null;
  body: Expr;
}

export interface ExprStatement {
  type: "ExprStatement";
  expression: Expr;
}

export interface LetStatement {
  type: "LetStatement";
  mutable: boolean;
  name: string;
  typeAnnotation: string | null;
  value: Expr;
}

export interface AssignStatement {
  type: "AssignStatement";
  name: string;
  value: Expr;
}

export interface CompoundAssignStatement {
  type: "CompoundAssignStatement";
  name: string;
  op: string;
  value: Expr;
}

export interface DerefAssignStatement {
  type: "DerefAssignStatement";
  target: Expr;
  value: Expr;
}

export interface BlockStatement {
  type: "BlockStatement";
  body: Statement[];
}

export interface IfStatement {
  type: "IfStatement";
  condition: Expr;
  thenBranch: Statement;
  elseBranch: Statement | null;
}

export interface WhileStatement {
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
  | DerefExpr;

export interface StructLiteral {
  type: "StructLiteral";
  structName: string;
  fields: { name: string; value: Expr }[];
}

export interface FieldAccess {
  type: "FieldAccess";
  object: Expr;
  field: string;
}

export interface CallExpr {
  type: "CallExpr";
  name: string;
  arguments: Expr[];
}

export interface BinaryExpr {
  type: "BinaryExpr";
  left: Expr;
  op: string;
  right: Expr;
}

export interface NumberLiteral {
  type: "NumberLiteral";
  value: number;
  typeAnnotation: string | null;
}

export interface Identifier {
  type: "Identifier";
  name: string;
}

export interface BooleanLiteral {
  type: "BooleanLiteral";
  value: boolean;
}

export interface RefExpr {
  type: "RefExpr";
  operand: Expr;
  mutable: boolean;
}

export interface DerefExpr {
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
