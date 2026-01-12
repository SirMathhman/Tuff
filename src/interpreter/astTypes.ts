/**
 * AST Node Types for Tuff Language
 * 
 * This module defines the complete AST structure for both expressions and statements.
 * Organized into: Expressions, Statements, Type Expressions, and Programs.
 */

// ============================================================================
// Expression Nodes
// ============================================================================

export interface ASTNumber {
  kind: "number";
  value: number;
  suffix?: string;
}

export interface ASTIdentifier {
  kind: "identifier";
  name: string;
}

export interface ASTBoolean {
  kind: "boolean";
  value: boolean;
}

export interface ASTBinaryOp {
  kind: "binary-op";
  op: string;
  left: ASTExpr;
  right: ASTExpr;
}

export interface ASTUnaryNot {
  kind: "unary-not";
  operand: ASTExpr;
}

export interface ASTUnaryMinus {
  kind: "unary-minus";
  operand: ASTExpr;
}

export interface ASTCall {
  kind: "call";
  func: ASTExpr;
  args: ASTExpr[];
}

export interface ASTMethodCall {
  kind: "method-call";
  receiver: ASTExpr;
  method: string;
  args: ASTExpr[];
}

export interface ASTIndex {
  kind: "index";
  target: ASTExpr;
  index: ASTExpr;
}

export interface ASTFieldAccess {
  kind: "field-access";
  object: ASTExpr;
  field: string;
}

export interface ASTDeref {
  kind: "deref";
  operand: ASTExpr;
}

export interface ASTAddressOf {
  kind: "address-of";
  operand: ASTExpr;
  mutable: boolean;
}

export interface ASTIfExpr {
  kind: "if-expr";
  condition: ASTExpr;
  thenBranch: ASTExpr;
  elseBranch: ASTExpr | null;
}

export interface ASTMatchExpr {
  kind: "match-expr";
  subject: ASTExpr;
  arms: ASTMatchArm[];
}

export interface ASTMatchArm {
  pattern: ASTPattern;
  body: ASTExpr;
}

export interface ASTArrayLiteral {
  kind: "array-literal";
  elements: ASTExpr[];
}

export interface ASTStructLiteral {
  kind: "struct-literal";
  typeName: string | null; // null when inferred from context (e.g., let x: Point = { ... })
  fields: ASTExpr[];
}

export interface ASTBlockExpr {
  kind: "block-expr";
  statements: ASTStmt[];
  finalExpr: ASTExpr | null; // The trailing expression that produces a value
}

export interface ASTThis {
  kind: "this";
}

export interface ASTThisField {
  kind: "this-field";
  field: string;
}

// Lambda/arrow function expression
export interface ASTLambda {
  kind: "lambda";
  params: ASTParam[];
  returnType: ASTTypeExpr | null;
  body: ASTExpr;
}

// Expression union type
export type ASTExpr =
  | ASTNumber
  | ASTIdentifier
  | ASTBoolean
  | ASTBinaryOp
  | ASTUnaryNot
  | ASTUnaryMinus
  | ASTCall
  | ASTMethodCall
  | ASTIndex
  | ASTFieldAccess
  | ASTDeref
  | ASTAddressOf
  | ASTIfExpr
  | ASTMatchExpr
  | ASTArrayLiteral
  | ASTStructLiteral
  | ASTBlockExpr
  | ASTThis
  | ASTThisField
  | ASTLambda;

// ============================================================================
// Pattern Nodes (for match expressions)
// ============================================================================

export interface ASTPatternLiteral {
  kind: "pattern-literal";
  value: ASTExpr; // number or identifier
}

export interface ASTPatternWildcard {
  kind: "pattern-wildcard";
}

export type ASTPattern = ASTPatternLiteral | ASTPatternWildcard;

// ============================================================================
// Statement Nodes
// ============================================================================

export interface ASTLetStmt {
  kind: "let-stmt";
  name: string;
  mutable: boolean;
  typeAnnotation: ASTTypeExpr | null;
  initializer: ASTExpr | null;
}

export interface ASTAssignStmt {
  kind: "assign-stmt";
  target: ASTExpr; // Can be identifier, index, deref, field access
  value: ASTExpr;
}

export interface ASTCompoundAssignStmt {
  kind: "compound-assign-stmt";
  target: ASTExpr;
  op: string; // +=, -=, *=, /=
  value: ASTExpr;
}

export interface ASTExprStmt {
  kind: "expr-stmt";
  expr: ASTExpr;
}

export interface ASTReturnStmt {
  kind: "return-stmt";
  value: ASTExpr | null;
}

export interface ASTYieldStmt {
  kind: "yield-stmt";
  value: ASTExpr;
}

export interface ASTBreakStmt {
  kind: "break-stmt";
}

export interface ASTContinueStmt {
  kind: "continue-stmt";
}

export interface ASTIfStmt {
  kind: "if-stmt";
  condition: ASTExpr;
  thenBranch: ASTStmt | ASTBlockExpr;
  elseBranch: ASTStmt | ASTBlockExpr | null;
}

export interface ASTWhileStmt {
  kind: "while-stmt";
  condition: ASTExpr;
  body: ASTStmt | ASTBlockExpr;
}

export interface ASTForStmt {
  kind: "for-stmt";
  varName: string;
  mutable: boolean;
  start: ASTExpr;
  end: ASTExpr;
  body: ASTStmt | ASTBlockExpr;
}

export interface ASTFnStmt {
  kind: "fn-stmt";
  name: string;
  params: ASTParam[];
  returnType: ASTTypeExpr | null;
  body: ASTExpr; // Usually a block-expr
}

export interface ASTStructStmt {
  kind: "struct-stmt";
  name: string;
  genericParams: string[];
  fields: ASTStructField[];
}

export interface ASTTypeStmt {
  kind: "type-stmt";
  name: string;
  aliasOf: ASTTypeExpr;
  destructor: string | null; // for linear types: "then destructorName"
}

// Statement union type
export type ASTStmt =
  | ASTLetStmt
  | ASTAssignStmt
  | ASTCompoundAssignStmt
  | ASTExprStmt
  | ASTReturnStmt
  | ASTYieldStmt
  | ASTBreakStmt
  | ASTContinueStmt
  | ASTIfStmt
  | ASTWhileStmt
  | ASTForStmt
  | ASTFnStmt
  | ASTStructStmt
  | ASTTypeStmt;

// ============================================================================
// Helper Types
// ============================================================================

export interface ASTParam {
  name: string;
  typeAnnotation: ASTTypeExpr;
}

export interface ASTStructField {
  name: string;
  typeAnnotation: ASTTypeExpr;
}

// ============================================================================
// Type Expression Nodes
// ============================================================================

export interface ASTTypeIdent {
  kind: "type-ident";
  name: string;
}

export interface ASTTypePointer {
  kind: "type-pointer";
  mutable: boolean;
  pointee: ASTTypeExpr;
}

export interface ASTTypeArray {
  kind: "type-array";
  elementType: ASTTypeExpr;
  init: number;
  length: number;
}

export interface ASTTypeSlice {
  kind: "type-slice";
  elementType: ASTTypeExpr;
}

export interface ASTTypeFunction {
  kind: "type-function";
  params: ASTTypeExpr[];
  returnType: ASTTypeExpr;
}

export interface ASTTypeGeneric {
  kind: "type-generic";
  baseName: string;
  typeArgs: ASTTypeExpr[];
}

export type ASTTypeExpr =
  | ASTTypeIdent
  | ASTTypePointer
  | ASTTypeArray
  | ASTTypeSlice
  | ASTTypeFunction
  | ASTTypeGeneric;

// ============================================================================
// Program Node
// ============================================================================

export interface ASTProgram {
  kind: "program";
  statements: ASTStmt[];
}

// ============================================================================
// Combined AST Node (any node in the tree)
// ============================================================================

export type ASTNode = ASTExpr | ASTStmt | ASTTypeExpr | ASTPattern | ASTProgram;
