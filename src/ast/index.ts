// Stage 0: TypeScript
// Abstract Syntax Tree node definitions

import type { SourceLocation } from "../lexer/types"

/**
 * Base class for all AST nodes
 */
export abstract class ASTNode {
  abstract readonly kind: string
  constructor(readonly location: SourceLocation) {}
}

/**
 * Type annotations in the language
 */
export type TypeAnnotation =
  | PrimitiveType
  | ArrayType
  | ReferenceType
  | FunctionType
  | UnionType
  | GenericType

export class PrimitiveType extends ASTNode {
  readonly kind = "PrimitiveType"
  constructor(
    readonly name: "i32" | "i64" | "u32" | "u64" | "f32" | "f64" | "bool" | "string" | "void",
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class ArrayType extends ASTNode {
  readonly kind = "ArrayType"
  constructor(
    readonly elementType: TypeAnnotation,
    readonly length?: number | Identifier,
    location?: SourceLocation,
  ) {
    super(location || elementType.location)
  }
}

export class ReferenceType extends ASTNode {
  readonly kind = "ReferenceType"
  constructor(
    readonly name: string,
    readonly typeArguments: TypeAnnotation[] = [],
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class FunctionType extends ASTNode {
  readonly kind = "FunctionType"
  constructor(
    readonly parameterTypes: TypeAnnotation[],
    readonly returnType: TypeAnnotation,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class UnionType extends ASTNode {
  readonly kind = "UnionType"
  constructor(
    readonly types: TypeAnnotation[],
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class GenericType extends ASTNode {
  readonly kind = "GenericType"
  constructor(
    readonly base: ReferenceType,
    readonly typeArguments: TypeAnnotation[],
    location?: SourceLocation,
  ) {
    super(location || base.location)
  }
}

/**
 * Expressions
 */
export type Expression =
  | Identifier
  | Literal
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

export class Identifier extends ASTNode {
  readonly kind = "Identifier"
  constructor(
    readonly name: string,
    location: SourceLocation,
  ) {
    super(location)
  }
}

export type Literal =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral

export class NumberLiteral extends ASTNode {
  readonly kind = "NumberLiteral"
  constructor(
    readonly value: number,
    readonly isFloat: boolean,
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class StringLiteral extends ASTNode {
  readonly kind = "StringLiteral"
  constructor(
    readonly value: string,
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class BooleanLiteral extends ASTNode {
  readonly kind = "BooleanLiteral"
  constructor(
    readonly value: boolean,
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class NullLiteral extends ASTNode {
  readonly kind = "NullLiteral"
  constructor(location: SourceLocation) {
    super(location)
  }
}

export class BinaryOp extends ASTNode {
  readonly kind = "BinaryOp"
  constructor(
    readonly left: Expression,
    readonly operator: string,
    readonly right: Expression,
    location?: SourceLocation,
  ) {
    super(location || left.location)
  }
}

export class UnaryOp extends ASTNode {
  readonly kind = "UnaryOp"
  constructor(
    readonly operator: string,
    readonly operand: Expression,
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class CallExpression extends ASTNode {
  readonly kind = "CallExpression"
  constructor(
    readonly function_: Expression,
    readonly args: Expression[],
    location?: SourceLocation,
  ) {
    super(location || (function_ as ASTNode).location)
  }
}

export class MemberAccess extends ASTNode {
  readonly kind = "MemberAccess"
  constructor(
    readonly object: Expression,
    readonly property: string,
    location?: SourceLocation,
  ) {
    super(location || object.location)
  }
}

export class IndexAccess extends ASTNode {
  readonly kind = "IndexAccess"
  constructor(
    readonly object: Expression,
    readonly index: Expression,
    location?: SourceLocation,
  ) {
    super(location || object.location)
  }
}

export class StructLiteral extends ASTNode {
  readonly kind = "StructLiteral"
  constructor(
    readonly structName: Identifier,
    readonly fields: Array<[string, Expression]>,
    location?: SourceLocation,
  ) {
    super(location || structName.location)
  }
}

export class ArrayLiteral extends ASTNode {
  readonly kind = "ArrayLiteral"
  constructor(
    readonly elements: Expression[],
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class IfExpression extends ASTNode {
  readonly kind = "IfExpression"
  constructor(
    readonly condition: Expression,
    readonly thenBranch: BlockExpression,
    readonly elseBranch?: BlockExpression | IfExpression,
    location?: SourceLocation,
  ) {
    super(location || condition.location)
  }
}

export class MatchExpression extends ASTNode {
  readonly kind = "MatchExpression"
  constructor(
    readonly value: Expression,
    readonly arms: MatchArm[],
    location?: SourceLocation,
  ) {
    super(location || value.location)
  }
}

export interface MatchArm {
  pattern: Pattern
  guard?: Expression
  body: Expression
}

export type Pattern = IdentifierPattern | LiteralPattern | WildcardPattern | StructPattern

export class IdentifierPattern extends ASTNode {
  readonly kind = "IdentifierPattern"
  constructor(
    readonly name: string,
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class LiteralPattern extends ASTNode {
  readonly kind = "LiteralPattern"
  constructor(
    readonly value: Literal,
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class WildcardPattern extends ASTNode {
  readonly kind = "WildcardPattern"
  constructor(location: SourceLocation) {
    super(location)
  }
}

export class StructPattern extends ASTNode {
  readonly kind = "StructPattern"
  constructor(
    readonly structName: string,
    readonly fields: Array<[string, Pattern]>,
    location: SourceLocation,
  ) {
    super(location)
  }
}

export class BlockExpression extends ASTNode {
  readonly kind = "BlockExpression"
  constructor(
    readonly statements: Statement[],
    readonly expression?: Expression,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class CastExpression extends ASTNode {
  readonly kind = "CastExpression"
  constructor(
    readonly expression: Expression,
    readonly type: TypeAnnotation,
    location?: SourceLocation,
  ) {
    super(location || expression.location)
  }
}

/**
 * Statements
 */
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

export class VariableDeclaration extends ASTNode {
  readonly kind = "VariableDeclaration"
  constructor(
    readonly name: string,
    readonly type?: TypeAnnotation,
    readonly initializer?: Expression,
    readonly isMutable: boolean = false,
    readonly isConstant: boolean = false,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class FunctionDeclaration extends ASTNode {
  readonly kind = "FunctionDeclaration"
  constructor(
    readonly name: string,
    readonly parameters: Parameter[],
    readonly returnType?: TypeAnnotation,
    readonly body?: BlockExpression,
    readonly isPublic: boolean = false,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export interface Parameter {
  name: string
  type: TypeAnnotation
  isMutable?: boolean
  defaultValue?: Expression
}

export class StructDeclaration extends ASTNode {
  readonly kind = "StructDeclaration"
  constructor(
    readonly name: string,
    readonly fields: StructField[],
    readonly typeParameters: string[] = [],
    readonly isPublic: boolean = false,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export interface StructField {
  name: string
  type: TypeAnnotation
  isPublic?: boolean
}

export class EnumDeclaration extends ASTNode {
  readonly kind = "EnumDeclaration"
  constructor(
    readonly name: string,
    readonly variants: EnumVariant[],
    readonly typeParameters: string[] = [],
    readonly isPublic: boolean = false,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export interface EnumVariant {
  name: string
  payload?: TypeAnnotation
}

export class TraitDeclaration extends ASTNode {
  readonly kind = "TraitDeclaration"
  constructor(
    readonly name: string,
    readonly methods: FunctionDeclaration[],
    readonly typeParameters: string[] = [],
    readonly isPublic: boolean = false,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class ImplBlock extends ASTNode {
  readonly kind = "ImplBlock"
  constructor(
    readonly traitName?: string,
    readonly forType?: ReferenceType,
    readonly methods: FunctionDeclaration[] = [],
    readonly typeParameters: string[] = [],
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class TypeAlias extends ASTNode {
  readonly kind = "TypeAlias"
  constructor(
    readonly name: string,
    readonly type: TypeAnnotation,
    readonly isPublic: boolean = false,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class ReturnStatement extends ASTNode {
  readonly kind = "ReturnStatement"
  constructor(
    readonly value?: Expression,
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

export class BreakStatement extends ASTNode {
  readonly kind = "BreakStatement"
  constructor(location: SourceLocation) {
    super(location)
  }
}

export class ContinueStatement extends ASTNode {
  readonly kind = "ContinueStatement"
  constructor(location: SourceLocation) {
    super(location)
  }
}

export class ExpressionStatement extends ASTNode {
  readonly kind = "ExpressionStatement"
  constructor(
    readonly expression: Expression,
    location?: SourceLocation,
  ) {
    super(location || expression.location)
  }
}

export class UseStatement extends ASTNode {
  readonly kind = "UseStatement"
  constructor(
    readonly module: string,
    readonly imports?: string[],
    location?: SourceLocation,
  ) {
    super(location!)
  }
}

/**
 * Program
 */
export class Program extends ASTNode {
  readonly kind = "Program"
  constructor(
    readonly statements: Statement[],
    location?: SourceLocation,
  ) {
    super(location!)
  }
}
