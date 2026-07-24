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
  line: number;
  column: number;
}

export type Statement =
  | NumberLiteralNode
  | IdentifierNode
  | LetDeclarationNode
  | AssignmentNode
  | StructDefinitionNode
  | MemberAssignmentNode
  | TypeAliasNode;

export interface NumberLiteralExpr {
  type: "NumberLiteral";
  value: number;
  typeName?: string;
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

export type Expression =
  | NumberLiteralExpr
  | IdentifierExpr
  | StructInstanceExpr
  | MemberExpressionExpr;
