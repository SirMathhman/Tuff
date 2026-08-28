import type { TuffValue } from "./values.ts";

/** A literal expression node (number or boolean). */
export interface LiteralNode {
  kind: "Literal";
  value: TuffValue;
  /** The type suffix (e.g. `U8`), if a number literal carried one. */
  suffix?: string;
}

/** An identifier expression node. */
export interface IdentifierNode {
  kind: "Identifier";
  name: string;
}

/** A binary `||` expression node. */
export interface OrNode {
  kind: "Or";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `&&` expression node. */
export interface AndNode {
  kind: "And";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `+` expression node. */
export interface AddNode {
  kind: "Add";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `==` expression node. */
export interface EqualNode {
  kind: "Equal";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `<` expression node. */
export interface LessNode {
  kind: "Less";
  left: TuffExpr;
  right: TuffExpr;
}

/** A prefix `&` reference expression node. */
export interface RefNode {
  kind: "Ref";
  mut: boolean;
  operand: TuffExpr;
}

/** A prefix `*` dereference expression node. */
export interface DerefNode {
  kind: "Deref";
  operand: TuffExpr;
}

/** A tuple literal expression node: `(e, e, ...)`. */
export interface TupleNode {
  kind: "Tuple";
  elements: TuffExpr[];
}

/** A tuple-index expression node: `tuple.N`. */
export interface TupleIndexNode {
  kind: "TupleIndex";
  operand: TuffExpr;
  index: number;
}

/** An array literal expression node: `[e, e, ...]`. */
export interface ArrayNode {
  kind: "Array";
  elements: TuffExpr[];
}

/** An array-index expression node: `array[i]`. */
export interface ArrayIndexNode {
  kind: "ArrayIndex";
  operand: TuffExpr;
  index: TuffExpr;
}

/** A range expression node: `start..end`, a half-open integer range. */
export interface RangeNode {
  kind: "Range";
  left: TuffExpr;
  right: TuffExpr;
}

/** An `is` type-test expression node: `literal is Suffix`. */
export interface IsNode {
  kind: "Is";
  left: TuffExpr;
  right: KindName;
}

/** A named field of a struct declaration. */
export interface StructField {
  /** The field's name. */
  name: string;
  /** The field's declared kind. */
  type: KindName;
}

/** A named field of a struct literal. */
export interface StructLiteralField {
  /** The field's name. */
  name: string;
  /** The field's initializer expression. */
  value: TuffExpr;
}

/** A struct literal expression node: `Name { field : expr, ... }`. */
export interface StructLiteralNode {
  kind: "StructLiteral";
  /** The struct name the literal constructs. */
  name: string;
  /** The fields, in source order. */
  fields: StructLiteralField[];
}

/** A field-access expression node: `operand.field`. */
export interface FieldAccessNode {
  kind: "FieldAccess";
  operand: TuffExpr;
  /** The field name being read. */
  field: string;
}

/** A function call expression node: `name(args...)`. */
export interface CallNode {
  kind: "Call";
  /** The function name being called. */
  name: string;
  /** The argument expressions, in source order. */
  args: TuffExpr[];
}

/** A bare kind name in an `is` type-test right operand (e.g. `U8`, `Bool`). */
export interface KindNameBareNode {
  kind: "KindNameBare";
  name: string;
}

/**
 * A reference kind name in an `is` type-test right operand (e.g. `&U8`,
 * `&&mut U8`): the depth of the `&` chain, the outermost `mut` flag, and the
 * suffix the innermost name carries.
 */
export interface KindNameRefNode {
  kind: "KindNameRef";
  depth: number;
  mut: boolean;
  name: string;
}

/** A tuple kind name in an `is` type-test right operand (e.g. `(U8, U8)`). */
export interface KindNameTupleNode {
  kind: "KindNameTuple";
  elements: KindName[];
}

/**
 * An array kind name in an `is` type-test right operand (e.g. `[U8; 3]`):
 * the element test and the length the array literal must have.
 */
export interface KindNameArrayNode {
  kind: "KindNameArray";
  element: KindName;
  length: number;
}

/** A kind name: the right operand of an `is` type-test. */
export type KindName =
  | KindNameBareNode
  | KindNameRefNode
  | KindNameTupleNode
  | KindNameArrayNode;

/** A parsed tuff expression. */
export type TuffExpr =
  | LiteralNode
  | IdentifierNode
  | OrNode
  | AndNode
  | AddNode
  | EqualNode
  | LessNode
  | RefNode
  | DerefNode
  | TupleNode
  | TupleIndexNode
  | ArrayNode
  | ArrayIndexNode
  | RangeNode
  | IsNode
  | StructLiteralNode
  | FieldAccessNode
  | CallNode;

/** A named, typed parameter of a function declaration. */
export interface FnParam {
  /** The parameter's name. */
  name: string;
  /** The parameter's declared kind. */
  type: KindName;
}

/**
 * A `fn name(params) [: KindName] => body` function declaration statement
 * node. The body is a block statement; the function is compile-time
 * registered and executed by name at call sites. The return kind may be
 * omitted, in which case the return type is inferred from the body.
 */
export interface FnNode {
  kind: "Fn";
  /** The function name being declared. */
  name: string;
  /** The declared parameters, in source order. */
  params: FnParam[];
  /** The declared return kind, if annotated. */
  returnType?: KindName;
  /** The function body block. */
  body: BlockNode;
}

/** A `struct Name { field : KindName, ... }` declaration statement node. */
export interface StructNode {
  kind: "Struct";
  /** The struct name being declared. */
  name: string;
  /** The declared fields, in source order. */
  fields: StructField[];
}

/** A `type Name = KindName` alias declaration statement node. */
export interface TypeNode {
  kind: "Type";
  name: string;
  /** The kind name the alias stands for. */
  alias: KindName;
}

/** A `let` declaration statement node. */
export interface LetNode {
  kind: "Let";
  mut: boolean;
  name: string;
  /** The declared type, if the declaration carried a `: KindName` annotation. */
  annotation?: KindName;
  value: TuffExpr;
}

/** An assignment statement node. */
export interface AssignNode {
  kind: "Assign";
  target: TuffExpr;
  value: TuffExpr;
}

/** A `return` statement node. */
export interface ReturnNode {
  kind: "Return";
  value: TuffExpr;
}

/** A braced block statement node. */
export interface BlockNode {
  kind: "Block";
  statements: TuffStatement[];
}

/** An `if` statement node with an optional `else` branch. */
export interface IfNode {
  kind: "If";
  condition: TuffExpr;
  then: TuffStatement;
  else: TuffStatement | null;
}

/** A `while` loop statement node. */
export interface WhileNode {
  kind: "While";
  condition: TuffExpr;
  body: TuffStatement;
}

/** A `for (name in range)` loop statement node. */
export interface ForNode {
  kind: "For";
  name: string;
  range: TuffExpr;
  body: TuffStatement;
}

/** A `break` statement node that exits the enclosing loop. */
export interface BreakNode {
  kind: "Break";
}

/** A `continue` statement node that skips to the next loop iteration. */
export interface ContinueNode {
  kind: "Continue";
}

/** A parsed tuff statement. */
export type TuffStatement =
  | LetNode
  | TypeNode
  | StructNode
  | FnNode
  | AssignNode
  | ReturnNode
  | BlockNode
  | IfNode
  | WhileNode
  | ForNode
  | BreakNode
  | ContinueNode;

/** A mutable parse position over a token list. */
export interface Pos {
  i: number;
}
