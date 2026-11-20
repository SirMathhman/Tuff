import type { Span } from "./span.ts";

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

export interface TuffErrorOf<K extends TuffErrorKind> {
  kind: K;
  span: Span;
}

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
