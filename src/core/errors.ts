/** A successful result carrying a value. */
export interface Ok<T> {
  ok: true;
  value: T;
}

/** A failed result carrying a structured error. */
export interface Err<E> {
  ok: false;
  error: E;
}

/** A discriminated union of success and failure. */
export type Result<T, E> = Ok<T> | Err<E>;

/** Create a successful result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Create a failed result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** The input contained no statements. Fix: provide at least one statement. */
export interface EvalErrorEmptyProgram {
  kind: "EmptyProgram";
}

/** The lexer encountered a character it cannot tokenize. Fix: remove or replace the character. */
export interface EvalErrorUnexpectedToken {
  kind: "UnexpectedToken";
  /** The offending character. */
  character: string;
  /** Zero-based character offset in the source. */
  position: number;
}

/** A statement the evaluator does not recognize. Fix: use `let` or `return` statements. */
export interface EvalErrorUnexpectedStatement {
  kind: "UnexpectedStatement";
  /** The offending statement text. */
  statement: string;
  /** Zero-based character offset of the statement's first token. */
  position: number;
}

/** A `return` referenced a variable that was never declared. Fix: declare it with `let` first. */
export interface EvalErrorUnknownIdentifier {
  kind: "UnknownIdentifier";
  /** The undeclared variable name. */
  name: string;
  /** Zero-based character offset of the statement that used the variable. */
  position: number;
}

/** An assignment to a variable declared without `mut`. Fix: declare it with `let mut`. */
export interface EvalErrorImmutableAssignment {
  kind: "ImmutableAssignment";
  /** The immutable variable name. */
  name: string;
  /** Zero-based character offset of the assignment statement. */
  position: number;
}

/** An array index was out of bounds. Fix: use an index within the array's length. */
export interface EvalErrorIndexOutOfBounds {
  kind: "IndexOutOfBounds";
  /** The index that was out of bounds. */
  index: number;
  /** The array's length. */
  length: number;
  /** Zero-based character offset of the index expression. */
  position: number;
}

/** A value of the wrong type was assigned to a variable. Fix: assign a value of the variable's type. */
export interface EvalErrorTypeMismatch {
  kind: "TypeMismatch";
  /** The variable name. */
  name: string;
  /** The variable's type, set by its initializer. */
  expected: string;
  /** The type of the value being assigned. */
  actual: string;
  /** Zero-based character offset of the assignment statement. */
  position: number;
}

/** The program ended without a `return` statement. Fix: add a `return` statement. */
export interface EvalErrorMissingReturn {
  kind: "MissingReturn";
}

/** A `return` statement was used inside a `{ ... }` block value. Fix: end the block in a bare expression instead. */
export interface EvalErrorReturnInBlockValue {
  kind: "ReturnInBlockValue";
  /** Zero-based character offset of the `return` statement. */
  position: number;
}

/** A `match` expression has no `_` wildcard arm, so it may not match. Fix: add a `case _ => ...` arm. */
export interface EvalErrorMissingWildcardArm {
  kind: "MissingWildcardArm";
  /** Zero-based character offset of the `match` expression. */
  position: number;
}

/** An integer literal is outside the range of its suffixed type. Fix: use a wider type or a smaller value. */
export interface EvalErrorIntegerOutOfRange {
  kind: "IntegerOutOfRange";
  /** The integer type the literal was suffixed with (e.g. `u8`). */
  type: string;
  /** The literal's numeric value. */
  value: number;
  /** Zero-based character offset of the literal. */
  position: number;
}

/** A number literal carries a lowercase integer suffix (e.g. `100u8`). Fix: use the uppercase suffix (`100U8`). */
export interface EvalErrorInvalidIntegerSuffix {
  kind: "InvalidIntegerSuffix";
  /** The offending suffix as written (e.g. `u8`). */
  suffix: string;
  /** Zero-based character offset of the suffix. */
  position: number;
}

/** An `is` type-test names a type that does not exist. Fix: use a valid type name (`U8`..`U64`, `I8`..`I64`, `Number`, `Bool`). */
export interface EvalErrorUnknownType {
  kind: "UnknownType";
  /** The type name as written. */
  name: string;
  /** Zero-based character offset of the type name. */
  position: number;
}

/** A `break` was used outside of a `while` loop. Fix: move it inside a loop. */
export interface EvalErrorBreakOutsideLoop {
  kind: "BreakOutsideLoop";
  /** Zero-based character offset of the `break` statement. */
  position: number;
}

/** A `continue` was used outside of a `while` loop. Fix: move it inside a loop. */
export interface EvalErrorContinueOutsideLoop {
  kind: "ContinueOutsideLoop";
  /** Zero-based character offset of the `continue` statement. */
  position: number;
}

/**
 * Structured errors produced by `evaluate`.
 * Each variant answers: what went wrong, where, and how to fix it.
 */
export type EvalError =
  | EvalErrorEmptyProgram
  | EvalErrorUnexpectedToken
  | EvalErrorUnexpectedStatement
  | EvalErrorUnknownIdentifier
  | EvalErrorImmutableAssignment
  | EvalErrorIndexOutOfBounds
  | EvalErrorTypeMismatch
  | EvalErrorMissingReturn
  | EvalErrorReturnInBlockValue
  | EvalErrorMissingWildcardArm
  | EvalErrorIntegerOutOfRange
  | EvalErrorInvalidIntegerSuffix
  | EvalErrorUnknownType
  | EvalErrorBreakOutsideLoop
  | EvalErrorContinueOutsideLoop;
