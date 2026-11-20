import type { Span } from "./span.ts";

/** Every kind of failure Tuff can report. */
export enum TuffErrorKind {
  /** A character that starts no token. */
  UnexpectedCharacter = "UnexpectedCharacter",
  /** The source ended before a construct was complete. */
  UnexpectedEnd = "UnexpectedEnd",
  /** A token that is not valid at this position. */
  UnexpectedToken = "UnexpectedToken",
  /** A group opened with `(` or `{` was closed with the wrong bracket or not at all. */
  ExpectedClosingParen = "ExpectedClosingParen",
  /** Division by zero. */
  DivisionByZero = "DivisionByZero",
  /** A value or literal is not finite (overflow to `Infinity` or `NaN`). */
  NumericOverflow = "NumericOverflow",
  /** Groups are nested deeper than the parser allows. */
  NestingTooDeep = "NestingTooDeep",
  /** A name is used but not bound in any enclosing block. */
  UnknownName = "UnknownName",
  /** A name is bound twice in the same block. */
  DuplicateName = "DuplicateName",
}

/** A failure of kind `K`, located by the span it covers in the source. */
export interface TuffErrorOf<K extends TuffErrorKind> {
  /** Which failure this is. */
  kind: K;
  /** Where in the source the failure occurred. */
  span: Span;
}

/** Any failure Tuff can report: one variant per `TuffErrorKind`. */
export type TuffError =
  | TuffErrorOf<TuffErrorKind.UnexpectedCharacter>
  | TuffErrorOf<TuffErrorKind.UnexpectedEnd>
  | TuffErrorOf<TuffErrorKind.UnexpectedToken>
  | TuffErrorOf<TuffErrorKind.ExpectedClosingParen>
  | TuffErrorOf<TuffErrorKind.DivisionByZero>
  | TuffErrorOf<TuffErrorKind.NumericOverflow>
  | TuffErrorOf<TuffErrorKind.NestingTooDeep>
  | TuffErrorOf<TuffErrorKind.UnknownName>
  | TuffErrorOf<TuffErrorKind.DuplicateName>;
