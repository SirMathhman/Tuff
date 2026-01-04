import { Span } from "../common/span.js";
import { Token } from "../lexer/token.js";

export interface Node {
  span: Span;
}

export type Statement =
  | ImportDecl
  | LetDecl
  | FnDecl
  | StructDecl
  | ImplDecl
  | TypeAliasDecl
  | ExternDecl
  | YieldStmt
  | ExpressionStmt;

export type Expression =
  | LiteralExpr
  | BinaryExpr
  | UnaryExpr
  | BlockExpr
  | IfExpr
  | WhileExpr
  | CallExpr
  | AccessExpr
  | IndexExpr
  | SliceExpr
  | IsExpr
  | IdentifierExpr;

export type TypeNode =
  | PrimitiveType
  | ArrayType
  | SliceType
  | UnionType
  | NamedType;

// --- Statements ---

/**
 * Example: `from System::IO use { println };`
 */
export interface ImportDecl extends Node {
  kind: "ImportDecl";
  namespace: string[];
  members: string[];
}

/**
 * Example: `out let mut x: I32 = 10;`
 */
export interface LetDecl extends Node {
  kind: "LetDecl";
  isPublic: boolean;
  isMutable: boolean;
  name: string;
  type?: TypeNode;
  initializer: Expression;
}

/**
 * Example: `fn add(a: I32, b: I32): I32 => a + b;`
 */
export interface FnDecl extends Node {
  kind: "FnDecl";
  isPublic: boolean;
  name: string;
  params: Param[];
  returnType?: TypeNode;
  body: Expression; // Can be a BlockExpr or a simple Expression
}

export interface Param {
  name: string;
  type: TypeNode;
}

/**
 * Example: `struct Point { x: I32, y: I32 }`
 */
export interface StructDecl extends Node {
  kind: "StructDecl";
  isPublic: boolean;
  name: string;
  fields: Field[];
}

export interface Field {
  name: string;
  type: TypeNode;
}

/**
 * Example: `impl Point { ... }`
 */
export interface ImplDecl extends Node {
  kind: "ImplDecl";
  target: string;
  methods: FnDecl[];
}

/**
 * Example: `type Name = TypeA | TypeB;`
 */
export interface TypeAliasDecl extends Node {
  kind: "TypeAliasDecl";
  isPublic: boolean;
  name: string;
  type: TypeNode;
}

/**
 * Example: `extern intrinsic type NativeString;`
 */
export interface ExternDecl extends Node {
  kind: "ExternDecl";
  isIntrinsic: boolean;
  name: string;
  typeKind: "type" | "fn";
  type?: TypeNode; // For functions
}

/**
 * Example: `yield 100;`
 */
export interface YieldStmt extends Node {
  kind: "YieldStmt";
  expression: Expression;
}

/**
 * Example: `x = 200;`
 */
export interface ExpressionStmt extends Node {
  kind: "ExpressionStmt";
  expression: Expression;
}

// --- Expressions ---

/**
 * Example: `123`, `"hello"`, `true`
 */
export interface LiteralExpr extends Node {
  kind: "LiteralExpr";
  value: any;
  token: Token;
}

/**
 * Example: `myVar`
 */
export interface IdentifierExpr extends Node {
  kind: "IdentifierExpr";
  name: string;
  token: Token;
}

/**
 * Example: `a + b`
 */
export interface BinaryExpr extends Node {
  kind: "BinaryExpr";
  left: Expression;
  operator: Token;
  right: Expression;
}

/**
 * Example: `-x`, `!y`
 */
export interface UnaryExpr extends Node {
  kind: "UnaryExpr";
  operator: Token;
  right: Expression;
}

/**
 * Example: `{ yield 1; }`
 */
export interface BlockExpr extends Node {
  kind: "BlockExpr";
  statements: Statement[];
}

/**
 * Example: `if (cond) { ... } else { ... }`
 */
export interface IfExpr extends Node {
  kind: "IfExpr";
  condition: Expression;
  thenBranch: BlockExpr;
  elseBranch?: BlockExpr;
}

/**
 * Example: `while (cond) { ... }`
 */
export interface WhileExpr extends Node {
  kind: "WhileExpr";
  condition: Expression;
  body: BlockExpr;
}

/**
 * Example: `func(arg1, arg2)`
 */
export interface CallExpr extends Node {
  kind: "CallExpr";
  callee: Expression;
  args: Expression[];
}

/**
 * Example: `obj.member`
 */
export interface AccessExpr extends Node {
  kind: "AccessExpr";
  object: Expression;
  member: string;
}

/**
 * Example: `arr[0]`
 */
export interface IndexExpr extends Node {
  kind: "IndexExpr";
  object: Expression;
  index: Expression;
}

/**
 * Example: `arr[0..2]`
 */
export interface SliceExpr extends Node {
  kind: "SliceExpr";
  object: Expression;
  start: Expression;
  end: Expression;
}

/**
 * Example: `value is Some<I32>`
 */
export interface IsExpr extends Node {
  kind: "IsExpr";
  expression: Expression;
  type: TypeNode;
}

// --- Types ---

/**
 * Example: `I32`, `Bool`
 */
export interface PrimitiveType extends Node {
  kind: "PrimitiveType";
  name: string;
}

/**
 * Example: `[I32; 3; 3]`
 */
export interface ArrayType extends Node {
  kind: "ArrayType";
  elementType: TypeNode;
  initialized: number;
  length: number;
}

/**
 * Example: `*[I32]`, `*mut [I32]`
 */
export interface SliceType extends Node {
  kind: "SliceType";
  elementType: TypeNode;
  isMutable: boolean;
}

/**
 * Example: `I32 | Bool`
 */
export interface UnionType extends Node {
  kind: "UnionType";
  types: TypeNode[];
}

/**
 * Example: `Point`
 */
export interface NamedType extends Node {
  kind: "NamedType";
  name: string;
}

export interface Program extends Node {
  kind: "Program";
  statements: Statement[];
}

export interface AstVisitor<R> {
  visitProgram(node: Program): R;
  visitImportDecl(node: ImportDecl): R;
  visitLetDecl(node: LetDecl): R;
  visitFnDecl(node: FnDecl): R;
  visitStructDecl(node: StructDecl): R;
  visitImplDecl(node: ImplDecl): R;
  visitTypeAliasDecl(node: TypeAliasDecl): R;
  visitExternDecl(node: ExternDecl): R;
  visitYieldStmt(node: YieldStmt): R;
  visitExpressionStmt(node: ExpressionStmt): R;

  visitLiteralExpr(node: LiteralExpr): R;
  visitIdentifierExpr(node: IdentifierExpr): R;
  visitBinaryExpr(node: BinaryExpr): R;
  visitUnaryExpr(node: UnaryExpr): R;
  visitBlockExpr(node: BlockExpr): R;
  visitIfExpr(node: IfExpr): R;
  visitWhileExpr(node: WhileExpr): R;
  visitCallExpr(node: CallExpr): R;
  visitAccessExpr(node: AccessExpr): R;
  visitIndexExpr(node: IndexExpr): R;
  visitSliceExpr(node: SliceExpr): R;
  visitIsExpr(node: IsExpr): R;

  visitPrimitiveType(node: PrimitiveType): R;
  visitArrayType(node: ArrayType): R;
  visitSliceType(node: SliceType): R;
  visitUnionType(node: UnionType): R;
  visitNamedType(node: NamedType): R;
}
