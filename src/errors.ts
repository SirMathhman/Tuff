/**
 * A structured error produced by the evaluator.
 */
export type TuffError =
  | { type: "UnknownIdentifier"; name: string }
  | { type: "ParseError"; message: string; position: number };
