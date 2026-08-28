/** An error for referencing an identifier that is not in scope. */
export interface UnidentifiedIdentifierError {
  kind: "UnidentifiedIdentifier";
  name: string;
  line: number;
}

/** An error for an expression that is neither a number nor an identifier. */
export interface InvalidExpressionError {
  kind: "InvalidExpression";
  expression: string;
  line: number;
}

/** An error for a statement that is not a recognized statement form. */
export interface InvalidStatementError {
  kind: "InvalidStatement";
  token: string;
  line: number;
}

/** An error for assigning to a binding declared without `mut`. */
export interface ImmutableAssignmentError {
  kind: "ImmutableAssignment";
  name: string;
  line: number;
}

/** An error for dereferencing a value that is not a reference. */
export interface InvalidDerefError {
  kind: "InvalidDeref";
  /** The identifier named by the operand, or "" if not an identifier. */
  name: string;
  line: number;
}

/** An error for taking a reference of an expression that is not an identifier. */
export interface InvalidReferenceError {
  kind: "InvalidReference";
  /** The identifier named by the operand, or "" if not an identifier. */
  name: string;
  line: number;
}

/** An error for assigning a value whose type differs from the binding's type. */
export interface TypeMismatchError {
  kind: "TypeMismatch";
  name: string;
  line: number;
}

/** An error for a character the tokenizer does not recognize. */
export interface UnexpectedCharacterError {
  kind: "UnexpectedCharacter";
  character: string;
  line: number;
}

/** An error for a `break` statement outside of a loop. */
export interface BreakOutsideLoopError {
  kind: "BreakOutsideLoop";
  line: number;
}

/** An error for a `continue` statement outside of a loop. */
export interface ContinueOutsideLoopError {
  kind: "ContinueOutsideLoop";
  line: number;
}

/** An error for indexing a tuple with an out-of-bounds index. */
export interface InvalidTupleIndexError {
  kind: "InvalidTupleIndex";
  /** The identifier named by the operand, or "" if not an identifier. */
  name: string;
  index: number;
  line: number;
}

/** An error for indexing an array with an out-of-bounds index. */
export interface InvalidArrayIndexError {
  kind: "InvalidArrayIndex";
  /** The identifier named by the operand, or "" if not an identifier. */
  name: string;
  index: number;
  line: number;
}

/** An error for assigning through an array index that is not an array. */
export interface InvalidArrayIndexAssignError {
  kind: "InvalidArrayIndexAssign";
  /** The identifier named by the operand, or "" if not an identifier. */
  name: string;
  line: number;
}

/** An error for a number literal carrying a type suffix outside the legal set. */
export interface InvalidNumberSuffixError {
  kind: "InvalidNumberSuffix";
  /** The offending suffix. */
  suffix: string;
  line: number;
}

/** An error for a number literal whose value is outside its suffix's range. */
export interface NumberOutOfRangeError {
  kind: "NumberOutOfRange";
  /** The literal's value. */
  value: number;
  /** The suffix whose range the value is outside. */
  suffix: string;
  line: number;
}

/** An error for using a reserved keyword as an identifier. */
export interface ReservedIdentifierError {
  kind: "ReservedIdentifier";
  /** The reserved word used as an identifier. */
  name: string;
  line: number;
}

/** An error for re-pointing a reference at a binding that does not outlive it. */
export interface DanglingReferenceError {
  kind: "DanglingReference";
  /** The name of the binding the reference is re-pointed at. */
  name: string;
  line: number;
}

/** The structured errors an evaluation can produce. */
export type TuffError =
  | UnidentifiedIdentifierError
  | InvalidExpressionError
  | InvalidStatementError
  | ImmutableAssignmentError
  | InvalidDerefError
  | InvalidReferenceError
  | TypeMismatchError
  | UnexpectedCharacterError
  | BreakOutsideLoopError
  | ContinueOutsideLoopError
  | InvalidTupleIndexError
  | InvalidArrayIndexError
  | InvalidArrayIndexAssignError
  | InvalidNumberSuffixError
  | NumberOutOfRangeError
  | ReservedIdentifierError
  | DanglingReferenceError;

/** A successful evaluation result. */
export interface TuffOk {
  ok: true;
  value: number;
}

/** A failed evaluation result. */
export interface TuffErr {
  ok: false;
  error: TuffError;
}

/** The result of evaluating a tuff program. */
export type TuffResult = TuffOk | TuffErr;
