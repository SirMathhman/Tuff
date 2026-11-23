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
 * Any error that interpretTuff can return.
 */
export type TuffError =
  | InvalidTerm
  | TermTooLarge
  | ResultTooLarge
  | NestingTooDeep
  | UndefinedName
  | ImmutableAssignment;

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
export function undefinedNameAt(where: ErrorWhere): Err<TuffError> {
  return err({
    kind: "UndefinedName",
    why: `${JSON.stringify(where.text)} is not declared.`,
    where,
    fix: `Declare it first with let ${where.text} = ...; before using it.`,
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
