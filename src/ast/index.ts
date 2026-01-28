// Stage 0: TypeScript
// Abstract Syntax Tree node definitions

import type { SourceLocation } from "../lexer/types"

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
  readonly kind: string
  readonly location: SourceLocation
}

// ============================================================================
// Type Annotations
// ============================================================================

export type TypeAnnotation =
  | PrimitiveType
  | ArrayType
  | ReferenceType
  | FunctionType
  | UnionType
  | GenericType

export interface PrimitiveType extends ASTNode {
  readonly kind: "PrimitiveType"
  readonly name: "i32" | "i64" | "u32" | "u64" | "f32" | "f64" | "bool" | "string" | "void"
}

export function createPrimitiveType(
  name: "i32" | "i64" | "u32" | "u64" | "f32" | "f64" | "bool" | "string" | "void",
  location: SourceLocation,
): PrimitiveType {
  return { kind: "PrimitiveType", name, location }
}

export interface ArrayType extends ASTNode {
  readonly kind: "ArrayType"
  readonly elementType: TypeAnnotation
  readonly length?: number | Identifier
}

export function createArrayType(
  elementType: TypeAnnotation,
  location: SourceLocation,
  length?: number | Identifier,
): ArrayType {
  return { kind: "ArrayType", elementType, length, location }
}

export interface ReferenceType extends ASTNode {
  readonly kind: "ReferenceType"
  readonly name: string
  readonly typeArguments: readonly TypeAnnotation[]
}

export function createReferenceType(
  name: string,
  location: SourceLocation,
  typeArguments: TypeAnnotation[] = [],
): ReferenceType {
  return { kind: "ReferenceType", name, typeArguments, location }
}

export interface FunctionType extends ASTNode {
  readonly kind: "FunctionType"
  readonly parameterTypes: readonly TypeAnnotation[]
  readonly returnType: TypeAnnotation
}

export function createFunctionType(
  parameterTypes: TypeAnnotation[],
  returnType: TypeAnnotation,
  location: SourceLocation,
): FunctionType {
  return { kind: "FunctionType", parameterTypes, returnType, location }
}

export interface UnionType extends ASTNode {
  readonly kind: "UnionType"
  readonly types: readonly TypeAnnotation[]
}

export function createUnionType(types: TypeAnnotation[], location: SourceLocation): UnionType {
  return { kind: "UnionType", types, location }
}

export interface GenericType extends ASTNode {
  readonly kind: "GenericType"
  readonly base: ReferenceType
  readonly typeArguments: readonly TypeAnnotation[]
}

export function createGenericType(
  base: ReferenceType,
  typeArguments: TypeAnnotation[],
  location: SourceLocation,
): GenericType {
  return { kind: "GenericType", base, typeArguments, location }
}

// ============================================================================
// Expressions
// ============================================================================

export type Expression =
  | Identifier
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | BinaryOp
  | UnaryOp
  | CallExpression
  | MemberAccess
  | IndexAccess
  | StructLiteral
  | ArrayLiteral
  | IfExpression
  | MatchExpression
  | BlockExpression
  | CastExpression

export interface Identifier extends ASTNode {
  readonly kind: "Identifier"
  readonly name: string
}

export function createIdentifier(name: string, location: SourceLocation): Identifier {
  return { kind: "Identifier", name, location }
}

export interface NumberLiteral extends ASTNode {
  readonly kind: "NumberLiteral"
  readonly value: number
  readonly isFloat: boolean
}

export function createNumberLiteral(
  value: number,
  isFloat: boolean,
  location: SourceLocation,
): NumberLiteral {
  return { kind: "NumberLiteral", value, isFloat, location }
}

export interface StringLiteral extends ASTNode {
  readonly kind: "StringLiteral"
  readonly value: string
}

export function createStringLiteral(value: string, location: SourceLocation): StringLiteral {
  return { kind: "StringLiteral", value, location }
}

export interface BooleanLiteral extends ASTNode {
  readonly kind: "BooleanLiteral"
  readonly value: boolean
}

export function createBooleanLiteral(value: boolean, location: SourceLocation): BooleanLiteral {
  return { kind: "BooleanLiteral", value, location }
}

export interface NullLiteral extends ASTNode {
  readonly kind: "NullLiteral"
}

export function createNullLiteral(location: SourceLocation): NullLiteral {
  return { kind: "NullLiteral", location }
}

export interface BinaryOp extends ASTNode {
  readonly kind: "BinaryOp"
  readonly left: Expression
  readonly operator: string
  readonly right: Expression
}

export function createBinaryOp(
  left: Expression,
  operator: string,
  right: Expression,
  location: SourceLocation,
): BinaryOp {
  return { kind: "BinaryOp", left, operator, right, location }
}

export interface UnaryOp extends ASTNode {
  readonly kind: "UnaryOp"
  readonly operator: string
  readonly operand: Expression
}

export function createUnaryOp(
  operator: string,
  operand: Expression,
  location: SourceLocation,
): UnaryOp {
  return { kind: "UnaryOp", operator, operand, location }
}

export interface CallExpression extends ASTNode {
  readonly kind: "CallExpression"
  readonly function_: Expression
  readonly args: readonly Expression[]
}

export function createCallExpression(
  function_: Expression,
  args: Expression[],
  location: SourceLocation,
): CallExpression {
  return { kind: "CallExpression", function_, args, location }
}

export interface MemberAccess extends ASTNode {
  readonly kind: "MemberAccess"
  readonly object: Expression
  readonly property: string
}

export function createMemberAccess(
  object: Expression,
  property: string,
  location: SourceLocation,
): MemberAccess {
  return { kind: "MemberAccess", object, property, location }
}

export interface IndexAccess extends ASTNode {
  readonly kind: "IndexAccess"
  readonly object: Expression
  readonly index: Expression
}

export function createIndexAccess(
  object: Expression,
  index: Expression,
  location: SourceLocation,
): IndexAccess {
  return { kind: "IndexAccess", object, index, location }
}

export interface StructLiteral extends ASTNode {
  readonly kind: "StructLiteral"
  readonly structName: Identifier
  readonly fields: readonly [string, Expression][]
}

export function createStructLiteral(
  structName: Identifier,
  fields: Array<[string, Expression]>,
  location: SourceLocation,
): StructLiteral {
  return { kind: "StructLiteral", structName, fields, location }
}

export interface ArrayLiteral extends ASTNode {
  readonly kind: "ArrayLiteral"
  readonly elements: readonly Expression[]
}

export function createArrayLiteral(
  elements: Expression[],
  location: SourceLocation,
): ArrayLiteral {
  return { kind: "ArrayLiteral", elements, location }
}

export interface IfExpression extends ASTNode {
  readonly kind: "IfExpression"
  readonly condition: Expression
  readonly thenBranch: BlockExpression
  readonly elseBranch?: BlockExpression | IfExpression
}

export function createIfExpression(
  condition: Expression,
  thenBranch: BlockExpression,
  location: SourceLocation,
  elseBranch?: BlockExpression | IfExpression,
): IfExpression {
  return { kind: "IfExpression", condition, thenBranch, elseBranch, location }
}

export interface MatchExpression extends ASTNode {
  readonly kind: "MatchExpression"
  readonly value: Expression
  readonly arms: readonly MatchArm[]
}

export function createMatchExpression(
  value: Expression,
  arms: MatchArm[],
  location: SourceLocation,
): MatchExpression {
  return { kind: "MatchExpression", value, arms, location }
}

export interface MatchArm {
  readonly pattern: Pattern
  readonly guard?: Expression
  readonly body: Expression
}

export function createMatchArm(
  pattern: Pattern,
  body: Expression,
  guard?: Expression,
): MatchArm {
  return { pattern, guard, body }
}

export interface BlockExpression extends ASTNode {
  readonly kind: "BlockExpression"
  readonly statements: readonly Statement[]
  readonly expression?: Expression
}

export function createBlockExpression(
  statements: Statement[],
  location: SourceLocation,
  expression?: Expression,
): BlockExpression {
  return { kind: "BlockExpression", statements, expression, location }
}

export interface CastExpression extends ASTNode {
  readonly kind: "CastExpression"
  readonly expression: Expression
  readonly type: TypeAnnotation
}

export function createCastExpression(
  expression: Expression,
  type: TypeAnnotation,
  location: SourceLocation,
): CastExpression {
  return { kind: "CastExpression", expression, type, location }
}


// ============================================================================
// Patterns
// ============================================================================

export type Pattern =
  | IdentifierPattern
  | LiteralPattern
  | WildcardPattern
  | StructPattern

export interface IdentifierPattern extends ASTNode {
  readonly kind: "IdentifierPattern"
  readonly name: string
}

export function createIdentifierPattern(
  name: string,
  location: SourceLocation,
): IdentifierPattern {
  return { kind: "IdentifierPattern", name, location }
}

export interface LiteralPattern extends ASTNode {
  readonly kind: "LiteralPattern"
  readonly value: NumberLiteral | StringLiteral | BooleanLiteral | NullLiteral
}

export function createLiteralPattern(
  value: NumberLiteral | StringLiteral | BooleanLiteral | NullLiteral,
  location: SourceLocation,
): LiteralPattern {
  return { kind: "LiteralPattern", value, location }
}

export interface WildcardPattern extends ASTNode {
  readonly kind: "WildcardPattern"
}

export function createWildcardPattern(location: SourceLocation): WildcardPattern {
  return { kind: "WildcardPattern", location }
}

export interface StructPattern extends ASTNode {
  readonly kind: "StructPattern"
  readonly structName: string
  readonly fields: readonly [string, Pattern][]
}

export function createStructPattern(
  structName: string,
  fields: Array<[string, Pattern]>,
  location: SourceLocation,
): StructPattern {
  return { kind: "StructPattern", structName, fields, location }
}

// ============================================================================
// Statements
// ============================================================================

export type Statement =
  | VariableDeclaration
  | FunctionDeclaration
  | StructDeclaration
  | EnumDeclaration
  | TraitDeclaration
  | ImplBlock
  | TypeAlias
  | ReturnStatement
  | BreakStatement
  | ContinueStatement
  | ExpressionStatement
  | UseStatement

export interface VariableDeclaration extends ASTNode {
  readonly kind: "VariableDeclaration"
  readonly name: string
  readonly type?: TypeAnnotation
  readonly initializer?: Expression
  readonly isMutable: boolean
  readonly isConstant: boolean
}

export function createVariableDeclaration(
  name: string,
  location: SourceLocation,
  options?: {
    type?: TypeAnnotation
    initializer?: Expression
    isMutable?: boolean
    isConstant?: boolean
  },
): VariableDeclaration {
  return {
    kind: "VariableDeclaration",
    name,
    type: options?.type,
    initializer: options?.initializer,
    isMutable: options?.isMutable ?? false,
    isConstant: options?.isConstant ?? false,
    location,
  }
}

export interface FunctionDeclaration extends ASTNode {
  readonly kind: "FunctionDeclaration"
  readonly name: string
  readonly parameters: readonly Parameter[]
  readonly returnType?: TypeAnnotation
  readonly body?: BlockExpression
  readonly isPublic: boolean
}

export function createFunctionDeclaration(
  name: string,
  parameters: Parameter[],
  location: SourceLocation,
  options?: {
    returnType?: TypeAnnotation
    body?: BlockExpression
    isPublic?: boolean
  },
): FunctionDeclaration {
  return {
    kind: "FunctionDeclaration",
    name,
    parameters,
    returnType: options?.returnType,
    body: options?.body,
    isPublic: options?.isPublic ?? false,
    location,
  }
}

export interface Parameter {
  readonly name: string
  readonly type: TypeAnnotation
  readonly isMutable?: boolean
  readonly defaultValue?: Expression
}

export function createParameter(
  name: string,
  type: TypeAnnotation,
  options?: {
    isMutable?: boolean
    defaultValue?: Expression
  },
): Parameter {
  return {
    name,
    type,
    isMutable: options?.isMutable,
    defaultValue: options?.defaultValue,
  }
}

export interface StructDeclaration extends ASTNode {
  readonly kind: "StructDeclaration"
  readonly name: string
  readonly fields: readonly StructField[]
  readonly typeParameters: readonly string[]
  readonly isPublic: boolean
}

export function createStructDeclaration(
  name: string,
  fields: StructField[],
  location: SourceLocation,
  options?: {
    typeParameters?: string[]
    isPublic?: boolean
  },
): StructDeclaration {
  return {
    kind: "StructDeclaration",
    name,
    fields,
    typeParameters: options?.typeParameters ?? [],
    isPublic: options?.isPublic ?? false,
    location,
  }
}

export interface StructField {
  readonly name: string
  readonly type: TypeAnnotation
  readonly isPublic?: boolean
}

export function createStructField(
  name: string,
  type: TypeAnnotation,
  isPublic?: boolean,
): StructField {
  return { name, type, isPublic }
}

export interface EnumDeclaration extends ASTNode {
  readonly kind: "EnumDeclaration"
  readonly name: string
  readonly variants: readonly EnumVariant[]
  readonly typeParameters: readonly string[]
  readonly isPublic: boolean
}

export function createEnumDeclaration(
  name: string,
  variants: EnumVariant[],
  location: SourceLocation,
  options?: {
    typeParameters?: string[]
    isPublic?: boolean
  },
): EnumDeclaration {
  return {
    kind: "EnumDeclaration",
    name,
    variants,
    typeParameters: options?.typeParameters ?? [],
    isPublic: options?.isPublic ?? false,
    location,
  }
}

export interface EnumVariant {
  readonly name: string
  readonly payload?: TypeAnnotation
}

export function createEnumVariant(
  name: string,
  payload?: TypeAnnotation,
): EnumVariant {
  return { name, payload }
}

export interface TraitDeclaration extends ASTNode {
  readonly kind: "TraitDeclaration"
  readonly name: string
  readonly methods: readonly FunctionDeclaration[]
  readonly typeParameters: readonly string[]
  readonly isPublic: boolean
}

export function createTraitDeclaration(
  name: string,
  methods: FunctionDeclaration[],
  location: SourceLocation,
  options?: {
    typeParameters?: string[]
    isPublic?: boolean
  },
): TraitDeclaration {
  return {
    kind: "TraitDeclaration",
    name,
    methods,
    typeParameters: options?.typeParameters ?? [],
    isPublic: options?.isPublic ?? false,
    location,
  }
}

export interface ImplBlock extends ASTNode {
  readonly kind: "ImplBlock"
  readonly traitName?: string
  readonly forType?: ReferenceType
  readonly methods: readonly FunctionDeclaration[]
  readonly typeParameters: readonly string[]
}

export function createImplBlock(
  location: SourceLocation,
  options?: {
    traitName?: string
    forType?: ReferenceType
    methods?: FunctionDeclaration[]
    typeParameters?: string[]
  },
): ImplBlock {
  return {
    kind: "ImplBlock",
    traitName: options?.traitName,
    forType: options?.forType,
    methods: options?.methods ?? [],
    typeParameters: options?.typeParameters ?? [],
    location,
  }
}

export interface TypeAlias extends ASTNode {
  readonly kind: "TypeAlias"
  readonly name: string
  readonly type: TypeAnnotation
  readonly isPublic: boolean
}

export function createTypeAlias(
  name: string,
  type: TypeAnnotation,
  location: SourceLocation,
  isPublic?: boolean,
): TypeAlias {
  return {
    kind: "TypeAlias",
    name,
    type,
    isPublic: isPublic ?? false,
    location,
  }
}

export interface ReturnStatement extends ASTNode {
  readonly kind: "ReturnStatement"
  readonly value?: Expression
}

export function createReturnStatement(
  location: SourceLocation,
  value?: Expression,
): ReturnStatement {
  return { kind: "ReturnStatement", value, location }
}

export interface BreakStatement extends ASTNode {
  readonly kind: "BreakStatement"
}

export function createBreakStatement(location: SourceLocation): BreakStatement {
  return { kind: "BreakStatement", location }
}

export interface ContinueStatement extends ASTNode {
  readonly kind: "ContinueStatement"
}

export function createContinueStatement(location: SourceLocation): ContinueStatement {
  return { kind: "ContinueStatement", location }
}

export interface ExpressionStatement extends ASTNode {
  readonly kind: "ExpressionStatement"
  readonly expression: Expression
}

export function createExpressionStatement(
  expression: Expression,
  location: SourceLocation,
): ExpressionStatement {
  return { kind: "ExpressionStatement", expression, location }
}

export interface UseStatement extends ASTNode {
  readonly kind: "UseStatement"
  readonly module: string
  readonly imports?: readonly string[]
}

export function createUseStatement(
  module: string,
  location: SourceLocation,
  imports?: string[],
): UseStatement {
  return { kind: "UseStatement", module, imports, location }
}

// ============================================================================
// Program
// ============================================================================

export interface Program extends ASTNode {
  readonly kind: "Program"
  readonly statements: readonly Statement[]
}

export function createProgram(statements: Statement[], location: SourceLocation): Program {
  return { kind: "Program", statements, location }
}
