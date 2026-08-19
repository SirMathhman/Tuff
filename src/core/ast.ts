/** A numeric literal, optionally suffixed with an integer type (`100U8`). */
export interface ValueNumber {
  kind: "number";
  value: number;
  /** The integer-type suffix (`u8`, `i32`, ...), when present. */
  suffix?: string;
  position: number;
}

/** A boolean literal. */
export interface ValueBool {
  kind: "bool";
  value: boolean;
  position: number;
}

/** A reference to a declared variable. */
export interface ValueIdent {
  kind: "ident";
  name: string;
  position: number;
}

/** A binary operation between two value expressions. */
export interface ValueBinary {
  kind: "binary";
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "+";
  left: Value;
  right: Value;
  position: number;
}

/**
 * An `is` type-test: `operand is TypeName`. Yields a number (`1` when the
 * operand's type equals the named type, `0` otherwise). The type name is
 * stored raw; the typecheck/evaluator resolve it against the `Type` model.
 */
export interface ValueIs {
  kind: "is";
  operand: Value;
  /** The raw type name as written (`U8`, `Number`, `Bool`, ...). */
  type: string;
  /** Zero-based character offset of the type name. */
  position: number;
}

/** An array literal (`[1, 2, 3]`), a homogeneous list of values. */
export interface ValueArray {
  kind: "array";
  elements: Value[];
  position: number;
}

/** An element of an array (`arr[i]`), a number index into the target. */
export interface ValueIndex {
  kind: "index";
  target: Value;
  index: Value;
  position: number;
}

/** The address of a variable (`&name` / `&mut name`), a pointer to its type. */
export interface ValueAddressOf {
  kind: "addressOf";
  /** True when taken with `&mut`, yielding a mutable pointer. */
  mutable: boolean;
  target: Value;
  position: number;
}

/** The value a pointer refers to (`*ptr`). */
export interface ValueDeref {
  kind: "deref";
  target: Value;
  position: number;
}

/** An array element as an assignment target (`arr[i]`). */
export interface ValueIndexAssign {
  kind: "indexAssign";
  target: Value;
  index: Value;
  position: number;
}

/** A numeric range (`start..end`), exclusive of `end`. */
export interface ValueRange {
  kind: "range";
  start: Value;
  end: Value;
  position: number;
}

/**
 * A `{ ... }` block used as a value expression. Its value is that of its final
 * bare expression, so the block must end in one.
 */
export interface ValueBlock {
  kind: "block";
  statements: Statement[];
  position: number;
}

/**
 * An `if` expression: `if (condition) then else else`. Both branches are value
 * expressions of the same type; the expression's value is that of the taken
 * branch.
 */
export interface ValueIf {
  kind: "if";
  condition: Value;
  then: Value;
  else: Value;
  position: number;
}

/** A number-literal `match` pattern. */
export interface MatchPatternNumber {
  kind: "number";
  value: number;
  position: number;
}

/** A bool-literal `match` pattern. */
export interface MatchPatternBool {
  kind: "bool";
  value: boolean;
  position: number;
}

/** The `_` wildcard `match` pattern. */
export interface MatchPatternWildcard {
  kind: "wildcard";
  position: number;
}

/** A `match` arm's pattern: a number/bool literal or the `_` wildcard. */
export type MatchPattern = MatchPatternNumber | MatchPatternBool | MatchPatternWildcard;

/** A `match` arm: `case pattern => value`. */
export interface MatchArm {
  pattern: MatchPattern;
  value: Value;
  position: number;
}

/**
 * A `match` expression: `match (scrutinee) { case p1 => v1; ... }`. The value
 * is that of the first arm whose pattern matches the scrutinee; a `_` arm is
 * required so the expression is total.
 */
export interface ValueMatch {
  kind: "match";
  scrutinee: Value;
  arms: MatchArm[];
  position: number;
}

/** A value expression: a literal, a variable reference, or a binary operation. */
export type Value =
  | ValueNumber
  | ValueBool
  | ValueIdent
  | ValueBinary
  | ValueIs
  | ValueArray
  | ValueIndex
  | ValueAddressOf
  | ValueDeref
  | ValueIndexAssign
  | ValueRange
  | ValueBlock
  | ValueIf
  | ValueMatch;

/** A variable declaration (`let` / `let mut`). */
export interface StatementLet {
  kind: "let";
  name: string;
  mutable: boolean;
  value: Value;
  position: number;
}

/** An assignment to an identifier, a dereference, or an array element. */
export interface StatementAssign {
  kind: "assign";
  /** The lvalue being assigned: an identifier, a dereference (`*ptr`), or an array element (`arr[i]`). */
  target: Value;
  value: Value;
  /** Present when the statement is a compound assignment (`+=`). */
  compound?: "+=";
  position: number;
}

/** A `return` statement. */
export interface StatementReturn {
  kind: "return";
  value: Value;
  position: number;
}

/** A block of statements. */
export interface StatementBlock {
  kind: "block";
  statements: Statement[];
  position: number;
}

/** An `if` statement with an optional `else` branch. */
export interface StatementIf {
  kind: "if";
  condition: Value;
  then: Statement[];
  /** Present only when an `else` branch was written. */
  else?: Statement[];
  position: number;
}

/** A `while` loop. */
export interface StatementWhile {
  kind: "while";
  condition: Value;
  body: Statement[];
  position: number;
}

/** A `for (i in range) { ... }` loop over a numeric range, exclusive of its end. */
export interface StatementFor {
  kind: "for";
  /** The loop variable, bound to each value in the range. */
  variable: string;
  /** The range to iterate: a `start..end` expression or a variable of range type. */
  range: Value;
  body: Statement[];
  position: number;
}

/** A `break` statement that exits the enclosing `while` loop. */
export interface StatementBreak {
  kind: "break";
  position: number;
}

/** A `continue` statement that skips to the next iteration of the enclosing `while` loop. */
export interface StatementContinue {
  kind: "continue";
  position: number;
}

/**
 * A bare value expression used as the final top-level statement. Its value is
 * the program's implicit result, so an explicit `return` is not required.
 */
export interface StatementExpr {
  kind: "expr";
  value: Value;
  position: number;
}

/**
 * A single program statement. `position` is the zero-based source offset of
 * the statement's first token.
 */
export type Statement =
  | StatementLet
  | StatementAssign
  | StatementReturn
  | StatementBlock
  | StatementIf
  | StatementWhile
  | StatementFor
  | StatementBreak
  | StatementContinue
  | StatementExpr;

/** A parsed program: a list of top-level statements. */
export interface Program {
  statements: Statement[];
}
