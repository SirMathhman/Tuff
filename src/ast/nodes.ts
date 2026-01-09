// ============= AST NODE TYPES =============

/**
 * Position information for AST nodes (for error reporting)
 */
export interface ASTPosition {
  position: number;
}

// ============= STATEMENT NODES =============

// Declaration statements (let, fn, struct, type, extern)
export interface LetStatementCore {
  kind: "let";
  name: string;
  isMutable: boolean;
  isDeclOnly: boolean;
}

export interface LetStatementMeta {
  annotation?: string;
  rhs?: ASTExpression;
}

export type LetStatement = LetStatementCore & LetStatementMeta & ASTPosition;

// Function declaration components
export interface FnDeclCore {
  kind: "fn";
  name: string;
  isBlock: boolean;
}

export interface FnDeclMeta {
  params: Array<{ name: string; annotation?: string }>;
  resultAnnotation?: string;
  body: ASTStatement[] | ASTExpression;
}

export type FnDeclaration = FnDeclCore & FnDeclMeta & ASTPosition;

export interface StructDeclaration {
  kind: "struct";
  name: string;
  fields: Array<{ name: string; annotation: string }>;
  position: number;
}

export interface TypeAliasDecl {
  kind: "type";
  name: string;
  aliasedType: string;
  position: number;
}

export interface ExternASTStatement {
  kind: "extern";
  subKind: "fn" | "let";
  name: string;
  annotation?: string;
  position: number;
}

// Control flow statements (if, while, for)
export interface IfStatement {
  kind: "if";
  condition: ASTExpression;
  trueBranch: ASTStatement[];
  falseBranch?: ASTStatement[];
  position: number;
}

export interface WhileStatement {
  kind: "while";
  condition: ASTExpression;
  body: ASTStatement[];
  position: number;
}

// For statement components
export interface ForStatementCore {
  kind: "for";
  loopVar: string;
  isMutable: boolean;
}

export interface ForStatementMeta {
  startExpr: ASTExpression;
  endExpr: ASTExpression;
  body: ASTStatement[];
}

export type ForStatement = ForStatementCore & ForStatementMeta & ASTPosition;

// Simple statements (expression, block, yield, assignment, import)
export interface ExpressionStatement {
  kind: "expression";
  expr: ASTExpression;
  position: number;
}

export interface BlockStatement {
  kind: "block";
  statements: ASTStatement[];
  position: number;
}

export interface YieldStatement {
  kind: "yield";
  expr: ASTExpression;
  position: number;
}

export interface ASTAssignmentTarget {
  type: "identifier" | "field" | "deref" | "index";
  name?: string;
  object?: ASTExpression;
  field?: string;
  index?: ASTExpression;
}

export interface AssignmentASTStatement {
  kind: "assignment";
  target: ASTAssignmentTarget;
  value: ASTExpression;
  operator?: string;
  position: number;
}

export interface ImportASTStatement {
  kind: "import";
  items: Array<{ name: string; alias?: string }>;
  from: string;
  position: number;
}

// ============= STATEMENT GROUPINGS (max 5 union members) =============

// Declaration statements group
type DeclarationStatements =
  | LetStatement
  | FnDeclaration
  | StructDeclaration
  | TypeAliasDecl
  | ExternASTStatement;

// Control flow statements group
type ControlFlowStatements = IfStatement | WhileStatement | ForStatement;

// Simple statements group
type SimpleStatements =
  | ExpressionStatement
  | BlockStatement
  | YieldStatement
  | AssignmentASTStatement
  | ImportASTStatement;

/**
 * Statement types - represent syntactic units that don't produce values
 * (Grouped into max 5 members per union rule)
 */
export type ASTStatement =
  | DeclarationStatements
  | ControlFlowStatements
  | SimpleStatements;

// ============= EXPRESSION NODES =============

export interface IntLiteralAST {
  kind: "int";
  value: bigint;
  suffix?: string;
  position: number;
}

export interface FloatLiteralAST {
  kind: "float";
  value: number;
  position: number;
}

export interface StringLiteralAST {
  kind: "string";
  value: string;
  position: number;
}

export interface BoolLiteralAST {
  kind: "bool";
  value: boolean;
  position: number;
}

/**
 * Literal types - primitive values (max 5)
 */
export type ASTLiteral =
  | IntLiteralAST
  | FloatLiteralAST
  | StringLiteralAST
  | BoolLiteralAST;

export interface ASTIdentifier {
  kind: "identifier";
  name: string;
  position: number;
}

export interface BinaryOpExpr {
  kind: "binary";
  operator: string;
  left: ASTExpression;
  right: ASTExpression;
  position: number;
}

export interface UnaryOpExpr {
  kind: "unary";
  operator: string;
  operand: ASTExpression;
  position: number;
}

export interface CallExpr {
  kind: "call";
  callee: ASTExpression;
  args: ASTExpression[];
  position: number;
}

export interface MemberAccessExpr {
  kind: "member";
  object: ASTExpression;
  property: string;
  position: number;
}

export interface IndexAccessExpr {
  kind: "index";
  object: ASTExpression;
  index: ASTExpression;
  position: number;
}

export interface MatchExpr {
  kind: "match";
  expr: ASTExpression;
  cases: Array<{
    pattern: string;
    body: ASTExpression;
  }>;
  position: number;
}

export interface ArrayLiteralExpr {
  kind: "array";
  elements: ASTExpression[];
  position: number;
}

export interface StructInstantiationExpr {
  kind: "struct-instantiation";
  structName: string;
  fields: Array<{ name: string; value: ASTExpression }>;
  position: number;
}

export interface BlockExpr {
  kind: "block-expr";
  statements: ASTStatement[];
  finalExpr?: ASTExpression;
  position: number;
}

export interface ParenExpr {
  kind: "paren";
  expr: ASTExpression;
  position: number;
}

// ============= EXPRESSION GROUPINGS (max 5 union members) =============

// Primitive expressions (literals and identifiers)
type PrimitiveExpressions = ASTLiteral | ASTIdentifier;

// Operator expressions (unary and binary)
type OperatorExpressions = BinaryOpExpr | UnaryOpExpr;

// Access expressions (call, member, index)
type AccessExpressions = CallExpr | MemberAccessExpr | IndexAccessExpr;

// Compound expressions (match, array, struct, block, paren)
type CompoundExpressions =
  | MatchExpr
  | ArrayLiteralExpr
  | StructInstantiationExpr
  | BlockExpr
  | ParenExpr;

/**
 * Expression types - represent syntactic units that produce values
 * (Grouped into max 5 members per union rule)
 */
export type ASTExpression =
  | PrimitiveExpressions
  | OperatorExpressions
  | AccessExpressions
  | CompoundExpressions;

/**
 * Top-level AST node type - all AST nodes are one of these
 */
export type ASTNode = ASTStatement | ASTExpression;

// ============= TYPE GUARDS =============

export function isLetStatement(stmt: ASTStatement): stmt is LetStatement {
  return stmt.kind === "let";
}

export function isIfStatement(stmt: ASTStatement): stmt is IfStatement {
  return stmt.kind === "if";
}

export function isWhileStatement(stmt: ASTStatement): stmt is WhileStatement {
  return stmt.kind === "while";
}

export function isForStatement(stmt: ASTStatement): stmt is ForStatement {
  return stmt.kind === "for";
}

export function isExpressionStatement(
  stmt: ASTStatement
): stmt is ExpressionStatement {
  return stmt.kind === "expression";
}

export function isBlockStatement(stmt: ASTStatement): stmt is BlockStatement {
  return stmt.kind === "block";
}

export function isFnDeclaration(stmt: ASTStatement): stmt is FnDeclaration {
  return stmt.kind === "fn";
}

export function isStructDeclaration(
  stmt: ASTStatement
): stmt is StructDeclaration {
  return stmt.kind === "struct";
}

export function isTypeAliasDecl(stmt: ASTStatement): stmt is TypeAliasDecl {
  return stmt.kind === "type";
}

export function isYieldStatement(stmt: ASTStatement): stmt is YieldStatement {
  return stmt.kind === "yield";
}

export function isAssignmentStatement(
  stmt: ASTStatement
): stmt is AssignmentASTStatement {
  return stmt.kind === "assignment";
}

export function isImportStatement(
  stmt: ASTStatement
): stmt is ImportASTStatement {
  return stmt.kind === "import";
}

export function isExternStatement(
  stmt: ASTStatement
): stmt is ExternASTStatement {
  return stmt.kind === "extern";
}

// Expression type guards
export function isIntLiteral(expr: ASTExpression): expr is IntLiteralAST {
  return expr.kind === "int";
}

export function isFloatLiteral(expr: ASTExpression): expr is FloatLiteralAST {
  return expr.kind === "float";
}

export function isStringLiteral(expr: ASTExpression): expr is StringLiteralAST {
  return expr.kind === "string";
}

export function isBoolLiteral(expr: ASTExpression): expr is BoolLiteralAST {
  return expr.kind === "bool";
}

export function isASTIdentifier(expr: ASTExpression): expr is ASTIdentifier {
  return expr.kind === "identifier";
}

export function isBinaryOpExpr(expr: ASTExpression): expr is BinaryOpExpr {
  return expr.kind === "binary";
}

export function isUnaryOpExpr(expr: ASTExpression): expr is UnaryOpExpr {
  return expr.kind === "unary";
}

export function isCallExpr(expr: ASTExpression): expr is CallExpr {
  return expr.kind === "call";
}

export function isMemberAccessExpr(
  expr: ASTExpression
): expr is MemberAccessExpr {
  return expr.kind === "member";
}

export function isIndexAccessExpr(
  expr: ASTExpression
): expr is IndexAccessExpr {
  return expr.kind === "index";
}

export function isMatchExpr(expr: ASTExpression): expr is MatchExpr {
  return expr.kind === "match";
}

export function isArrayLiteralExpr(
  expr: ASTExpression
): expr is ArrayLiteralExpr {
  return expr.kind === "array";
}

export function isStructInstantiationExpr(
  expr: ASTExpression
): expr is StructInstantiationExpr {
  return expr.kind === "struct-instantiation";
}

export function isBlockExpr(expr: ASTExpression): expr is BlockExpr {
  return expr.kind === "block-expr";
}

export function isParenExpr(expr: ASTExpression): expr is ParenExpr {
  return expr.kind === "paren";
}

export function isLiteralExpr(expr: ASTExpression): expr is ASTLiteral {
  return (
    expr.kind === "int" ||
    expr.kind === "float" ||
    expr.kind === "string" ||
    expr.kind === "bool"
  );
}
