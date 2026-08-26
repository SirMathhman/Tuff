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
  line: number;
}

/** An error for a character the tokenizer does not recognize. */
export interface UnexpectedCharacterError {
  kind: "UnexpectedCharacter";
  character: string;
  line: number;
}

/** The structured errors an evaluation can produce. */
export type TuffError =
  | UnidentifiedIdentifierError
  | InvalidExpressionError
  | InvalidStatementError
  | ImmutableAssignmentError
  | InvalidDerefError
  | UnexpectedCharacterError;

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
