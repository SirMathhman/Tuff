/**
 * An error for referencing an identifier that was never declared.
 */
export interface UnknownIdentifierError {
  type: "UnknownIdentifier";
  name: string;
}

/**
 * An error for assigning to a binding that is not mutable.
 */
export interface ImmutableAssignmentError {
  type: "ImmutableAssignment";
  name: string;
  position: number;
}

/**
 * An error for source that could not be parsed.
 */
export interface ParseError {
  type: "ParseError";
  message: string;
  position: number;
}

/**
 * A structured error produced by the evaluator.
 */
export type TuffError =
  | UnknownIdentifierError
  | ImmutableAssignmentError
  | ParseError;

/**
 * Build a structured parse error.
 *
 * @param message - Human-readable description of the failure.
 * @param position - Zero-based offset of the failure in the source.
 * @returns The structured error.
 */
export function parseError(message: string, position: number): TuffError {
  return { type: "ParseError", message, position };
}
