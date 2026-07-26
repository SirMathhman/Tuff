export interface Ok<T> {
  isOk: true;
  value: T;
}

export interface Err<X> {
  isOk: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export interface CompileError {
  message: string;
  reason: string;
  suggestedFix: string;
  line: number;
  column: number;
}

export interface Token {
  type: string;
  value: string;
  line: number;
  column: number;
  typeSuffix?: string;
}

export interface NumberLiteralNode {
  type: "NumberLiteral";
  value: number;
  line: number;
  column: number;
}

export interface IdentifierNode {
  type: "Identifier";
  name: string;
  line: number;
  column: number;
}

export interface LetDeclarationNode {
  type: "LetDeclaration";
  name: string;
  mutable: boolean;
  exported?: boolean;
  typeName?: string;
  value: Expression;
  line: number;
  column: number;
}

export interface AssignmentNode {
  type: "Assignment";
  name: string;
  value: Expression;
  line: number;
  column: number;
}

export interface StructField {
  name: string;
  typeName: string;
}

export interface StructDefinitionNode {
  type: "StructDefinition";
  name: string;
  typeParams: string[];
  fields: StructField[];
  exported?: boolean;
  line: number;
  column: number;
}

export interface MemberAssignmentNode {
  type: "MemberAssignment";
  object: Expression;
  field: string;
  value: Expression;
  line: number;
  column: number;
}

export interface TypeAliasNode {
  type: "TypeAlias";
  name: string;
  typeParams: string[];
  underlyingType: string;
  exported?: boolean;
  line: number;
  column: number;
}

export interface EnumDefinitionNode {
  type: "EnumDefinition";
  name: string;
  variants: string[];
  exported?: boolean;
  line: number;
  column: number;
}

export interface FunctionParam {
  name: string;
  typeName: string;
}

export interface FunctionDefinitionNode {
  type: "FunctionDefinition";
  name: string;
  typeParams: string[];
  params: FunctionParam[];
  returnType: string;
  body: Statement[];
  exported?: boolean;
  line: number;
  column: number;
}

export type Statement =
  | NumberLiteralNode
  | IdentifierNode
  | StringLiteralExpr
  | MemberExpressionExpr
  | LetDeclarationNode
  | AssignmentNode
  | StructDefinitionNode
  | MemberAssignmentNode
  | TypeAliasNode
  | EnumDefinitionNode
  | FunctionDefinitionNode
  | IsExpressionExpr
  | LogicalExpressionExpr
  | NotExpressionExpr
  | TupleExpr
  | ModuleAccessExpr
  | BinaryExpressionExpr
  | FunctionCallExpr;

export interface NumberLiteralExpr {
  type: "NumberLiteral";
  value: number;
  typeName?: string;
}

export interface BooleanLiteralExpr {
  type: "BooleanLiteral";
  value: boolean;
}

export interface IdentifierExpr {
  type: "Identifier";
  name: string;
}

export interface StructInstanceExpr {
  type: "StructInstance";
  structName: string;
  typeArgs: string[];
  fields: { name: string; value: Expression }[];
}

export interface MemberExpressionExpr {
  type: "MemberExpression";
  object: Expression;
  field: string;
}

export interface IsExpressionExpr {
  type: "IsExpression";
  operand: Expression;
  typeName: string;
}

export interface LogicalExpressionExpr {
  type: "LogicalExpression";
  operator: "AND" | "OR";
  left: Expression;
  right: Expression;
  line: number;
  column: number;
}

export interface NotExpressionExpr {
  type: "NotExpression";
  operand: Expression;
  line: number;
  column: number;
}

export interface TupleExpr {
  type: "TupleExpr";
  elements: Expression[];
}

export interface ModuleAccessExpr {
  type: "ModuleAccess";
  modulePath: string[];
  field: string;
  line: number;
  column: number;
}

export interface StringLiteralExpr {
  type: "StringLiteral";
  value: string;
  line: number;
  column: number;
}

export interface BinaryExpressionExpr {
  type: "BinaryExpression";
  operator: "+" | "-" | "*" | "/" | "%";
  left: Expression;
  right: Expression;
  line: number;
  column: number;
}

export interface FunctionCallExpr {
  type: "FunctionCall";
  functionName: string;
  object?: Expression;
  typeArgs: string[];
  args: Expression[];
  line: number;
  column: number;
}

export type Expression =
  | NumberLiteralExpr
  | BooleanLiteralExpr
  | StringLiteralExpr
  | IdentifierExpr
  | StructInstanceExpr
  | MemberExpressionExpr
  | IsExpressionExpr
  | LogicalExpressionExpr
  | NotExpressionExpr
  | TupleExpr
  | ModuleAccessExpr
  | BinaryExpressionExpr
  | FunctionCallExpr;

export interface VarEntry {
  name: string;
  mutable: boolean;
  typeName: string | undefined;
}

export interface StructDef {
  name: string;
  typeParams: string[];
  fields: StructField[];
  resolvedFields?: StructField[];
}

export interface EnumDef {
  name: string;
  variants: string[];
}

export interface TypeAliasDef {
  name: string;
  typeParams: string[];
  underlyingType: string;
}

export interface FunctionDef {
  name: string;
  typeParams: string[];
  params: FunctionParam[];
  returnType: string;
}

export interface TypeCheckCtx {
  scope: VarEntry[];
  structs: StructDef[];
  aliases: TypeAliasDef[];
  loc: { line: number; column: number };
}

export interface ModuleExportInfo {
  name: string;
  typeName: string | undefined;
  isFunction?: boolean;
  paramTypes?: string[];
  returnType?: string;
  typeParams?: string[];
}

export type ModuleExportsMap = Record<string, ModuleExportInfo[]>;

export interface CheckCtx {
  scope: VarEntry[];
  structs: StructDef[];
  aliases: TypeAliasDef[];
  functions: FunctionDef[];
  loc: { line: number; column: number };
  moduleExports?: ModuleExportsMap;
}

export const VALID_TYPES = [
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
  "Bool",
  "Str",
  "USize",
];
