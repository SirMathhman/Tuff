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

/**
 * A U64 value is outside 0 to 2^64-1.
 */
export interface U64OutOfRange extends TuffErrorDetails {
  /** The error kind. */
  kind: "U64OutOfRange";
}

/**
 * A struct constructor names a struct that was not declared.
 */
export interface UndefinedStruct extends TuffErrorDetails {
  /** The error kind. */
  kind: "UndefinedStruct";
}

/**
 * A struct constructor leaves out a field the struct declares.
 */
export interface MissingField extends TuffErrorDetails {
  /** The error kind. */
  kind: "MissingField";
}

/**
 * A record has no field with the name that was read or assigned.
 */
export interface UndefinedField extends TuffErrorDetails {
  /** The error kind. */
  kind: "UndefinedField";
}

/**
 * A value of a sized integer type other than U64 is outside that type's range.
 */
export interface IntegerOutOfRange extends TuffErrorDetails {
  /** The error kind. */
  kind: "IntegerOutOfRange";
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
  | ReferenceEscapes
  | U64OutOfRange
  | IntegerOutOfRange
  | UndefinedField
  | UndefinedStruct
  | MissingField;

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
 * Builds an out-of-range error for a sized integer value. U64 has its own kind; the other types share IntegerOutOfRange.
 * @param where - The token of the literal or operator that produced the value.
 * @param value - The value that is out of range.
 * @param type - The name of the integer type, such as "I8".
 * @param min - The smallest value of the type.
 * @param max - The largest value of the type.
 * @returns An Err result holding the out-of-range error.
 */
export function integerOutOfRangeAt(where: ErrorWhere, value: bigint, type: string, min: bigint, max: bigint): Err<TuffError> {
  return err({
    where,
    fix: `Use a ${type} value from ${min} to ${max}.`,
    why: `${value} is outside the ${type} range, which runs from ${min} to ${max}.`,
    kind: type === "U64" ? "U64OutOfRange" : "IntegerOutOfRange",
  });
}

/**
 * Builds an InvalidTerm error for a let annotation that names a struct which was not declared.
 * @param where - The token of the annotation.
 * @param name - The struct name that was used.
 * @returns An Err result holding the InvalidTerm error.
 */
export function undeclaredTypeAt(where: ErrorWhere, name: string): Err<TuffError> {
  return err({
    where,
    fix: `Declare struct ${name} { ... } at the start of the program, or use a sized integer type, Bool, or an array type.`,
    why: `${JSON.stringify(name)} is not a declared struct, so it is not a type.`,
    kind: "InvalidTerm",
  });
}

/**
 * Builds an ImmutableAssignment error for a field that cannot be assigned: a field not declared mut,
 * or any field of an anonymous record, which has no declaration to mark it.
 * @param where - The token of the record name.
 * @param field - The field that was assigned.
 * @param struct - The struct the record was built from, or undefined for an anonymous record.
 * @returns An Err result holding the ImmutableAssignment error.
 */
export function immutableFieldAt(where: ErrorWhere, field: string, struct: string | undefined): Err<TuffError> {
  if (struct === undefined) {
    return err({
      where,
      fix: "Build the value with a struct constructor and declare the field mut.",
      why: "The fields of an anonymous record cannot be assigned.",
      kind: "ImmutableAssignment",
    });
  }

  return err({
    where,
    fix: `Declare it in the struct definition as mut ${field} : Type.`,
    why: `${JSON.stringify(field)} is not declared mut in struct ${struct}, so it cannot be assigned.`,
    kind: "ImmutableAssignment",
  });
}

/**
 * Builds an UndefinedStruct error for a constructor whose struct name was not declared.
 * @param where - The token of the struct name.
 * @param name - The struct name that was used.
 * @returns An Err result holding the UndefinedStruct error.
 */
export function undefinedStructAt(where: ErrorWhere, name: string): Err<TuffError> {
  return err({
    where,
    fix: `Declare the struct first with struct ${name} { ... } before the statements.`,
    why: `${JSON.stringify(name)} is not a declared struct.`,
    kind: "UndefinedStruct",
  });
}

/**
 * Builds a MissingField error for a struct constructor that leaves out fields.
 * @param where - The token of the struct name.
 * @param name - The struct name.
 * @param missing - The names of the fields that were left out.
 * @returns An Err result holding the MissingField error.
 */
export function missingFieldAt(where: ErrorWhere, name: string, missing: string[]): Err<TuffError> {
  return err({
    where,
    fix: `Give a value for each of these fields: ${missing.join(", ")}.`,
    why: `The constructor of ${name} leaves out ${missing.join(", ")}.`,
    kind: "MissingField",
  });
}

/**
 * Builds an UndefinedField error for a field name that a record does not have.
 * @param where - The token of the field name.
 * @param name - The field name that was used.
 * @param fields - The names of the record's fields.
 * @returns An Err result holding the UndefinedField error.
 */
export function fieldNotFoundAt(where: ErrorWhere, name: string, fields: string[]): Err<TuffError> {
  return err({
    where,
    fix: `Use one of the record's fields: ${fields.join(", ")}.`,
    why: `${JSON.stringify(name)} is not a field of this record.`,
    kind: "UndefinedField",
  });
}

/**
 * Builds a DivisionByZero error for a division whose divisor is zero.
 * @param where - The token of the division operator.
 * @param operand - What is being divided, such as "A number" or "A U64".
 * @returns An Err result holding the DivisionByZero error.
 */
export function divisionByZeroAt(where: ErrorWhere, operand: string): Err<TuffError> {
  return err({
    where,
    fix: "Use a divisor other than zero.",
    why: `${operand} cannot be divided by zero.`,
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
 * Builds a ResultTooLarge error for a program whose final U64 value is too large to return as a number.
 * @param where - The token where the program's result is found.
 * @param value - The result that cannot be returned exactly as a number.
 * @returns An Err result holding the ResultTooLarge error.
 */
export function programResultTooLargeAt(where: ErrorWhere, value: bigint): Err<TuffError> {
  return err({
    kind: "ResultTooLarge",
    why: `The program's result, ${value}, is outside ±${Number.MAX_SAFE_INTEGER}, so it cannot be returned as a number without losing digits.`,
    where,
    fix: `End the program with a value from -${Number.MAX_SAFE_INTEGER} to ${Number.MAX_SAFE_INTEGER}.`,
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
