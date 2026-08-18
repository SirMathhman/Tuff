/**
 * Structured error codes for `evaluate`. Each error answers:
 * what happened, where, why it's an error, and how to fix it.
 */
export enum EvalErrorCode {
  UnexpectedCharacter = "UnexpectedCharacter",
  UnexpectedEnd = "UnexpectedEnd",
  ExpectedNumber = "ExpectedNumber",
  TrailingTokens = "TrailingTokens",
  ExpectedCloseParen = "ExpectedCloseParen",
  UnknownVariable = "UnknownVariable",
  ExpectedIdentifier = "ExpectedIdentifier",
  ExpectedAssign = "ExpectedAssign",
  ExpectedSemicolon = "ExpectedSemicolon",
  AssignmentToImmutable = "AssignmentToImmutable",
  AssignmentToUnknown = "AssignmentToUnknown",
  ExpectedReferenceTarget = "ExpectedReferenceTarget",
  DerefOfNonReference = "DerefOfNonReference",
  AssignmentToImmutableThroughReference = "AssignmentToImmutableThroughReference",
  ReferenceInExpression = "ReferenceInExpression",
  IndexOnNonArray = "IndexOnNonArray",
  IndexMustBeNumber = "IndexMustBeNumber",
  IndexOutOfBounds = "IndexOutOfBounds",
  ExpectedCommaOrCloseBracket = "ExpectedCommaOrCloseBracket",
}

export interface EvalError {
  code: EvalErrorCode;
  /** The full input that failed, so the caller can locate the problem. */
  input: string;
  /** 0-based index into `input` where the problem was detected, if known. */
  position?: number;
  /** Human-readable explanation of what went wrong and how to fix it. */
  message: string;
}

export interface EvalSuccess {
  ok: true;
  value: number;
}

export interface EvalFailure {
  ok: false;
  error: EvalError;
}

export type EvalResult = EvalSuccess | EvalFailure;

export function err(
  code: EvalErrorCode,
  input: string,
  message: string,
  position?: number,
): EvalFailure {
  return { ok: false, error: { code, input, message, position } };
}
