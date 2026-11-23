/**
 * A successful result carrying a value.
 */
export interface Ok<T> {
  /** Discriminant: always true for a successful result. */
  ok: true;
  /** The value produced by the computation. */
  value: T;
}

/**
 * A failed result carrying an error.
 */
export interface Err<E> {
  /** Discriminant: always false for a failed result. */
  ok: false;
  /** The error describing why the computation failed. */
  error: E;
}

/**
 * The outcome of a computation: either an Ok value or an Err error.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Where in the token list an error occurred.
 */
export interface ErrorWhere {
  /** Index of the token in the token list. */
  index: number;
  /** Text of the token, or the empty string at the end of the input. */
  text: string;
}

/**
 * Fields shared by every Tuff error.
 */
export interface TuffErrorDetails {
  /** Why the input is an error. */
  why: string;
  /** Where the cause of the error is. */
  where: ErrorWhere;
  /** How the user can fix the error. */
  fix: string;
}

/**
 * A token appears where the grammar does not allow it.
 */
export interface InvalidTerm extends TuffErrorDetails {
  /** The error kind. */
  kind: "InvalidTerm";
}

/**
 * A number literal is larger than the largest safe integer.
 */
export interface TermTooLarge extends TuffErrorDetails {
  /** The error kind. */
  kind: "TermTooLarge";
}

/**
 * An intermediate or final value leaves the safe integer range.
 */
export interface ResultTooLarge extends TuffErrorDetails {
  /** The error kind. */
  kind: "ResultTooLarge";
}

/**
 * Groups are nested deeper than the parser allows.
 */
export interface NestingTooDeep extends TuffErrorDetails {
  /** The error kind. */
  kind: "NestingTooDeep";
}

/**
 * A name is referenced but no let statement declares it.
 */
export interface UndefinedName extends TuffErrorDetails {
  /** The error kind. */
  kind: "UndefinedName";
}

/**
 * A name declared without mut is the target of an assignment.
 */
export interface ImmutableAssignment extends TuffErrorDetails {
  /** The error kind. */
  kind: "ImmutableAssignment";
}

/**
 * A value of one type is used where another type is required.
 */
export interface TypeMismatch extends TuffErrorDetails {
  /** The error kind. */
  kind: "TypeMismatch";
}

/**
 * Any error that interpretTuff can return.
 */
/**
 * An array index is negative or past the end of the array.
 */
export interface IndexOutOfRange extends TuffErrorDetails {
  /** The error kind. */
  kind: "IndexOutOfRange";
}

/**
 * A whole array was used by name after it had already been moved.
 */
export interface UseAfterMove extends TuffErrorDetails {
  /** The error kind. */
  kind: "UseAfterMove";
}

/**
 * An array literal has no elements, so its element type cannot be checked.
 */
export interface EmptyArrayLiteral extends TuffErrorDetails {
  /** The error kind. */
  kind: "EmptyArrayLiteral";
}

/**
 * A reference would outlive the name it points to.
 */
export interface ReferenceEscapes extends TuffErrorDetails {
  /** The error kind. */
  kind: "ReferenceEscapes";
}

/**
 * The divisor of a division is zero.
 */
export interface DivisionByZero extends TuffErrorDetails {
  /** The error kind. */
  kind: "DivisionByZero";
}

/**
 * A bitwise operand or shift amount is outside its allowed range.
 */
export interface BitwiseOutOfRange extends TuffErrorDetails {
  /** The error kind. */
  kind: "BitwiseOutOfRange";
}

export type TuffError =
  | InvalidTerm
  | TermTooLarge
  | ResultTooLarge
  | NestingTooDeep
  | UndefinedName
  | ImmutableAssignment
  | TypeMismatch
  | IndexOutOfRange
  | UseAfterMove
  | EmptyArrayLiteral
  | DivisionByZero
  | BitwiseOutOfRange
  | ReferenceEscapes;

function describeWhere(where: ErrorWhere): string {
  return where.text === ""
    ? "the end of the input"
    : `${JSON.stringify(where.text)} at index ${where.index}`;
}

/**
 * Renders an error as a multi-line message.
 * @param error - The error to render.
 * @returns The kind, why, where, and fix, one per line.
 */
export function describeError(error: TuffError): string {
  return `${error.kind}: ${error.why}\n  Where: ${describeWhere(error.where)}\n  Fix: ${error.fix}`;
}

/**
 * Wraps a value in a successful result.
 * @param value - The value to wrap.
 * @returns An Ok result holding the value.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Wraps an error in a failed result.
 * @param error - The error to wrap.
 * @returns An Err result holding the error.
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Builds an UndefinedName error for a reference to an undeclared name.
 * @param where - The token where the name is referenced.
 * @returns An Err result holding the UndefinedName error.
 */
/**
 * Builds an IndexOutOfRange error for an index outside an array.
 * @param where - The token of the index expression.
 * @param index - The index that was used.
 * @param length - The length of the array.
 * @returns An Err result holding the IndexOutOfRange error.
 */
export function indexOutOfRangeAt(where: ErrorWhere, index: number, length: number): Err<TuffError> {
  return err({
    where,
    fix: `Use an index from 0 to ${length - 1}.`,
    why: `Index ${index} is outside an array of length ${length}.`,
    kind: "IndexOutOfRange",
  });
}

/**
 * Builds a ReferenceEscapes error for a reference stored where its target is out of scope.
 * @param where - The token that would store the reference.
 * @returns An Err result holding the ReferenceEscapes error.
 */
export function referenceEscapesAt(where: ErrorWhere): Err<TuffError> {
  return err({
    where,
    fix: "Keep the reference inside the block of the value it points to, or copy the value instead.",
    why: "The referenced name is declared in a block that has already ended.",
    kind: "ReferenceEscapes",
  });
}

/**
 * Builds a BitwiseOutOfRange error for a value outside the range its bitwise operator allows.
 * @param where - The token of the bitwise operator.
 * @param value - The offending operand or shift amount.
 * @param allowed - A description of the allowed range.
 * @returns An Err result holding the BitwiseOutOfRange error.
 */
export function bitwiseOutOfRangeAt(where: ErrorWhere, value: number, allowed: string): Err<TuffError> {
  return err({
    where,
    fix: `Use a value that is ${allowed}.`,
    why: `${value} is outside the allowed range: it must be ${allowed}.`,
    kind: "BitwiseOutOfRange",
  });
}

/**
 * Builds a DivisionByZero error for a division whose divisor is zero.
 * @param where - The token of the division operator.
 * @returns An Err result holding the DivisionByZero error.
 */
export function divisionByZeroAt(where: ErrorWhere): Err<TuffError> {
  return err({
    where,
    fix: "Use a divisor other than zero.",
    why: "A number cannot be divided by zero.",
    kind: "DivisionByZero",
  });
}

/**
 * Builds an EmptyArrayLiteral error for an array literal with no elements.
 * @param where - The token that opens the empty array.
 * @returns An Err result holding the EmptyArrayLiteral error.
 */
export function emptyArrayAt(where: ErrorWhere): Err<TuffError> {
  return err({
    where,
    fix: "Write at least one element, such as [0]; the first element sets the array's type.",
    why: "An empty array has no element, so its element type cannot be checked.",
    kind: "EmptyArrayLiteral",
  });
}

/**
 * Builds a UseAfterMove error for a whole array used after it was moved.
 * @param where - The token that names the moved array.
 * @returns An Err result holding the UseAfterMove error.
 */
export function useAfterMoveAt(where: ErrorWhere): Err<TuffError> {
  return err({
    where,
    fix: `Assign ${where.text} a new value before using it again.`,
    why: `${where.text} was moved by an earlier use of the whole array.`,
    kind: "UseAfterMove",
  });
}

/**
 * Builds an UndefinedName error for a reference to an undeclared name.
 * @param where - The token where the name is referenced.
 * @returns An Err result holding the UndefinedName error.
 */
export function undefinedNameAt(where: ErrorWhere): Err<TuffError> {
  return err({
    kind: "UndefinedName",
    why: `${JSON.stringify(where.text)} is not declared.`,
    where,
    fix: `Declare it first with let ${where.text} = ...; before using it.`,
  });
}

/**
 * Builds a TypeMismatch error for a value of the wrong type at a position.
 * @param where - The token where the wrong type was used.
 * @param expected - A description of the type the position requires.
 * @param found - A description of the type that was supplied.
 * @returns An Err result holding the TypeMismatch error.
 */
export function typeMismatchAt(where: ErrorWhere, expected: string, found: string): Err<TuffError> {
  return err({
    where,
    fix: `Use ${expected} here.`,
    why: `Expected ${expected}, but got ${found}.`,
    kind: "TypeMismatch",
  });
}

/**
 * Builds an ImmutableAssignment error for an assignment to a name declared without mut.
 * @param where - The token where the assignment targets the name.
 * @returns An Err result holding the ImmutableAssignment error.
 */
export function immutableAssignmentAt(where: ErrorWhere): Err<TuffError> {
  return err({
    kind: "ImmutableAssignment",
    why: `${JSON.stringify(where.text)} was declared without mut, so it cannot be assigned.`,
    where,
    fix: `Declare it as let mut ${where.text} = ...; to allow assignment.`,
  });
}

/**
 * Builds a ResultTooLarge error for a value outside the safe integer range.
 * @param where - The operator or term where the value overflowed.
 * @returns An Err result holding the ResultTooLarge error.
 */
export function resultTooLargeAt(where: ErrorWhere): Err<TuffError> {
  return err({
    kind: "ResultTooLarge",
    why: `The running value leaves the safe integer range (±${Number.MAX_SAFE_INTEGER}), so its digits can no longer be stored exactly.`,
    where,
    fix: `Keep every intermediate and final result within ±${Number.MAX_SAFE_INTEGER}, for example by splitting the calculation.`,
  });
}
