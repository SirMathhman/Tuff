// ---- Token Types ----

export interface NumberToken {
  type: "number";
  value: number;
  // Optional type suffix, e.g. "U8" in "100U8".
  suffix?: string;
}
export interface BooleanToken {
  type: "boolean";
  value: boolean;
}
export interface IdentifierToken {
  type: "identifier";
  name: string;
}
export interface LetToken {
  type: "let";
}
export interface MutToken {
  type: "mut";
}
export interface IfToken {
  type: "if";
}
export interface ElseToken {
  type: "else";
}
export interface WhileToken {
  type: "while";
}
export interface IsToken {
  type: "is";
}
export interface FnToken {
  type: "fn";
}
export interface StructToken {
  type: "struct";
}
export interface ThisToken {
  type: "this";
}
export interface FatArrowToken {
  type: "fat_arrow";
}
export interface LParenToken {
  type: "lparen";
}
export interface RParenToken {
  type: "rparen";
}
export interface LBraceToken {
  type: "lbrace";
}
export interface RBraceToken {
  type: "rbrace";
}
export interface LBracketToken {
  type: "lbracket";
}
export interface RBracketToken {
  type: "rbracket";
}
export interface EqualsToken {
  type: "equals";
}
export interface EqualsEqualsToken {
  type: "equals_equals";
}
export interface BangEqualsToken {
  type: "bang_equals";
}
export interface ColonToken {
  type: "colon";
}
export interface CommaToken {
  type: "comma";
}
export interface SemicolonToken {
  type: "semicolon";
}
export interface PlusToken {
  type: "plus";
}
export interface PlusEqualsToken {
  type: "plus_equals";
}
export interface MinusToken {
  type: "minus";
}
export interface StarToken {
  type: "star";
}
export interface SlashToken {
  type: "slash";
}
export interface PipePipeToken {
  type: "pipe_pipe";
}
export interface AmpAmpToken {
  type: "amp_amp";
}
export interface AmpToken {
  type: "amp";
}
export interface LessThanToken {
  type: "less_than";
}
export interface LessThanEqualToken {
  type: "less_than_equal";
}
export interface GreaterThanToken {
  type: "greater_than";
}
export interface GreaterThanEqualToken {
  type: "greater_than_equal";
}
export interface DotToken {
  type: "dot";
}
export interface EOFToken {
  type: "eof";
}

export type Token =
  | NumberToken
  | BooleanToken
  | IdentifierToken
  | LetToken
  | MutToken
  | IfToken
  | ElseToken
  | WhileToken
  | IsToken
  | FnToken
  | StructToken
  | ThisToken
  | FatArrowToken
  | LParenToken
  | RParenToken
  | LBraceToken
  | RBraceToken
  | LBracketToken
  | RBracketToken
  | EqualsToken
  | EqualsEqualsToken
  | BangEqualsToken
  | ColonToken
  | CommaToken
  | SemicolonToken
  | PlusToken
  | PlusEqualsToken
  | MinusToken
  | StarToken
  | SlashToken
  | PipePipeToken
  | AmpAmpToken
  | AmpToken
  | LessThanToken
  | LessThanEqualToken
  | GreaterThanToken
  | GreaterThanEqualToken
  | DotToken
  | EOFToken;

// ---- Type System ----

// A structured type value. Named types (I32, U8, Bool, Void, Int) resolve to
// metadata in the TYPES table; reference and array types wrap a Type directly
// so composite types nest naturally (e.g. &[I32; 3]).
export interface NamedType {
  kind: "named";
  name: string;
}
export interface RefType {
  kind: "ref";
  inner: Type;
  isMut: boolean;
}
export interface ArrayType {
  kind: "array";
  elem: Type;
  length: number;
}
export interface StructType {
  kind: "struct";
  name: string;
}
export interface TupleType {
  kind: "tuple";
  // The element types, e.g. [I32, I32] in "(I32, I32)".
  elements: Type[];
}
export interface ThisType {
  kind: "this";
}
export type Type =
  NamedType | RefType | ArrayType | StructType | TupleType | ThisType;

// ---- AST Node Types ----

export interface NumberNode {
  kind: "number";
  value: number;
  // Optional type suffix, e.g. "U8" in "100U8".
  suffix?: string;
}
export interface BooleanNode {
  kind: "boolean";
  value: boolean;
}
export interface IdentifierNode {
  kind: "identifier";
  name: string;
}
export interface ThisNode {
  kind: "this";
}
export interface MemberAccessNode {
  kind: "member_access";
  object: ASTNode;
  property: string;
}
export interface BinaryOpNode {
  kind: "binary_op";
  left: ASTNode;
  op: string;
  right: ASTNode;
}
export interface IsNode {
  kind: "is";
  // The value whose type is being checked.
  value: ASTNode;
  // The type name being checked against, e.g. "Bool" in "true is Bool".
  typeName: string;
  // The compile-time result, computed by the checker: whether the value's
  // inferred type matches `typeName`.
  result: boolean;
}
export interface FnDeclNode {
  kind: "fn_decl";
  name: string;
  // The parameter list, e.g. [{ name: "first", type: "I32" }] in
  // "fn add(first : I32, second : I32) : I32 => ...".
  params: FnParam[];
  // The return type annotation, e.g. "I32" in "fn get() : I32 => 100".
  returnType: Type;
  // The function body expression.
  body: ASTNode;
}
// A single function parameter: a name and its declared type.
export interface FnParam {
  name: string;
  type: Type;
}
// The full signature of a declared function: its parameters and return type.
// Used by the checker to validate calls and resolve a call's type.
export interface FnSignature {
  params: FnParam[];
  returnType: Type;
}
export interface CallNode {
  kind: "call";
  // The name of the function being called.
  name: string;
  // The argument expressions, e.g. [3, 4] in "add(3, 4)".
  args: ASTNode[];
}
export interface RefNode {
  kind: "ref";
  // The expression being referenced, e.g. "x" in "&x".
  value: ASTNode;
  // Whether this is a mutable reference (e.g. "&mut x").
  isMut?: boolean;
}
export interface DerefNode {
  kind: "deref";
  // The reference being dereferenced, e.g. "y" in "*y".
  value: ASTNode;
}
export interface AssignNode {
  kind: "assign";
  name: string;
  value: ASTNode;
}
export interface DerefAssignNode {
  kind: "deref_assign";
  // The reference being assigned through, e.g. "y" in "*y = 100".
  target: ASTNode;
  value: ASTNode;
}
export interface ArrayNode {
  kind: "array";
  // The element expressions, e.g. [1, 2, 3].
  elements: ASTNode[];
}
export interface IndexNode {
  kind: "index";
  // The array being indexed, e.g. "array" in "array[0]".
  object: ASTNode;
  // The index expression, e.g. "0" in "array[0]".
  index: ASTNode;
}
export interface StructDeclNode {
  kind: "struct_decl";
  // The struct name, e.g. "Point" in "struct Point { ... }".
  name: string;
  // The fields, e.g. [{ name: "x", type: "I32" }].
  fields: StructField[];
}
// A single struct field: a name and its declared type.
export interface StructField {
  name: string;
  type: Type;
}
export interface StructInitNode {
  kind: "struct_init";
  // The struct type name, e.g. "Point" in "Point { x : 3, y : 4 }".
  name: string;
  // The field values, keyed by field name.
  fields: StructInitField[];
}
// A single struct-initializer field: a name and its value expression.
export interface StructInitField {
  name: string;
  value: ASTNode;
}
export interface TupleNode {
  kind: "tuple";
  // The element expressions, e.g. [3, 4] in "(3, 4)".
  elements: ASTNode[];
}
export interface TupleIndexNode {
  kind: "tuple_index";
  // The tuple being indexed, e.g. "tuple" in "tuple.0".
  object: ASTNode;
  // The element index, e.g. 0 in "tuple.0".
  index: number;
}
export interface LetDeclNode {
  kind: "let_decl";
  name: string;
  value: ASTNode;
  isMut?: boolean;
  // Optional type annotation, e.g. "U8" in "let x : U8 = 100U8;".
  typeAnnotation?: Type;
}
export interface IfNode {
  kind: "if";
  condition: ASTNode;
  thenBranch: ASTNode;
  // elseBranch is optional: an `if` used as a statement may omit it, but an
  // `if` used as a value must have one (a value must always be produced).
  elseBranch?: ASTNode;
}
export interface BlockNode {
  kind: "block";
  statements: ASTNode[];
}
export interface WhileNode {
  kind: "while";
  condition: ASTNode;
  body: ASTNode;
}

export type ASTNode =
  | NumberNode
  | BooleanNode
  | IdentifierNode
  | ThisNode
  | MemberAccessNode
  | BinaryOpNode
  | IsNode
  | FnDeclNode
  | CallNode
  | RefNode
  | DerefNode
  | AssignNode
  | DerefAssignNode
  | ArrayNode
  | IndexNode
  | StructDeclNode
  | StructInitNode
  | TupleNode
  | TupleIndexNode
  | LetDeclNode
  | IfNode
  | BlockNode
  | WhileNode;

// A node is a pure expression if it produces a value without side effects.
// Declarations (let_decl) and assignments (assign) are statements, not
// pure expressions.
export function isExpression(node: ASTNode): boolean {
  return node.kind !== "let_decl" && node.kind !== "assign";
}

// ---- Operator Table ----

export interface OperatorInfo {
  symbol: string;
  precedence: number;
  associativity?: "left" | "right";
}

// Single source of truth for binary operators.
// Keyed by token type so the parser and tokenizer share one definition.
export const OPERATORS = new Map<Token["type"], OperatorInfo>([
  ["pipe_pipe", { symbol: "||", precedence: 5 }],
  ["amp_amp", { symbol: "&&", precedence: 6 }],
  ["less_than", { symbol: "<", precedence: 8 }],
  ["less_than_equal", { symbol: "<=", precedence: 8 }],
  ["greater_than", { symbol: ">", precedence: 8 }],
  ["greater_than_equal", { symbol: ">=", precedence: 8 }],
  ["equals_equals", { symbol: "==", precedence: 8 }],
  ["bang_equals", { symbol: "!=", precedence: 8 }],
  ["plus", { symbol: "+", precedence: 10 }],
  ["minus", { symbol: "-", precedence: 10 }],
  ["star", { symbol: "*", precedence: 20 }],
  ["slash", { symbol: "/", precedence: 20 }],
]);
