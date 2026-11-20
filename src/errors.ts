import type { Span } from "./span.ts";

/** Every kind of failure Tuff can report. */
export enum TuffErrorKind {
  UnexpectedCharacter = "UnexpectedCharacter",
  UnexpectedEnd = "UnexpectedEnd",
  UnexpectedToken = "UnexpectedToken",
  ExpectedClosingParen = "ExpectedClosingParen",
  DivisionByZero = "DivisionByZero",
  NumericOverflow = "NumericOverflow",
  NestingTooDeep = "NestingTooDeep",
  UnknownName = "UnknownName",
  DuplicateName = "DuplicateName",
}

/** A failure of kind `K`, located by the span it covers in the source. */
export interface TuffErrorOf<K extends TuffErrorKind> {
  kind: K;
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
