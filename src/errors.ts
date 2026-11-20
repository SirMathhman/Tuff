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
  /** The resolver and evaluator disagree about a binding. This is a bug in Tuff, not in the source. */
  InternalError = "InternalError",
  /** An assignment targets a name that was declared with `let`, not `let mut`. */
  ImmutableAssignment = "ImmutableAssignment",
  /** A boolean was used as an operand of an arithmetic operator. */
  BooleanOperand = "BooleanOperand",
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
  | TuffErrorOf<TuffErrorKind.DuplicateName>
  | TuffErrorOf<TuffErrorKind.InternalError>
  | TuffErrorOf<TuffErrorKind.ImmutableAssignment>
  | TuffErrorOf<TuffErrorKind.BooleanOperand>;

/** What a person needs to act on a `TuffError`: what it is, where, why, and how to fix it. */
export interface ErrorExplanation {
  /** A short name for the failure. */
  what: string;
  /** Where in the source the failure occurred. */
  where: Span;
  /** Why the source is rejected. */
  why: string;
  /** What the author can change to make the error go away. */
  fix: string;
}

/** The wording for one kind of failure, without its location. */
interface Wording {
  /** A short name for the failure. */
  what: string;
  /** Why the source is rejected. */
  why: string;
  /** What the author can change to make the error go away. */
  fix: string;
}

const WORDING: Record<TuffErrorKind, Wording> = {
  [TuffErrorKind.UnexpectedCharacter]: {
    what: "Unexpected character",
    why: "This character does not start any token. Tuff accepts digits, letters, + - * / ( ) { } = and ;.",
    fix: "Remove the character. Hex and exponent notation such as 0x10 or 1e3 are not supported.",
  },
  [TuffErrorKind.UnexpectedEnd]: {
    what: "Unexpected end of input",
    why: "The source ended before an expression, group, or statement was complete.",
    fix: "Add the missing part: an operand, a closing bracket, or the final expression of a block.",
  },
  [TuffErrorKind.UnexpectedToken]: {
    what: "Unexpected token",
    why: "This token is not valid at this position. Each let statement needs a name, '=', an expression, and ';'.",
    fix: "Remove the token, or insert the missing operator, '=', or ';'. The word let is reserved and cannot be a name.",
  },
  [TuffErrorKind.ExpectedClosingParen]: {
    what: "Mismatched closing bracket",
    why: "A group opened with '(' must close with ')', and a block opened with '{' must close with '}'.",
    fix: "Replace this bracket with the one that matches its opener, or add the missing closer.",
  },
  [TuffErrorKind.DivisionByZero]: {
    what: "Division by zero",
    why: "The right-hand operand of '/' is 0, so the quotient is undefined.",
    fix: "Change the divisor so that it is not zero.",
  },
  [TuffErrorKind.NumericOverflow]: {
    what: "Numeric overflow",
    why: "The value is not a finite number: it is larger than the largest number Tuff can represent.",
    fix: "Use smaller numbers, or fewer multiplications and additions that grow the value.",
  },
  [TuffErrorKind.NestingTooDeep]: {
    what: "Nesting too deep",
    why: "Groups and blocks are nested more than 256 levels deep.",
    fix: "Reduce the nesting. Binding intermediate results with let in one block flattens the structure.",
  },
  [TuffErrorKind.UnknownName]: {
    what: "Unknown name",
    why: "This name is not bound by any enclosing block at this point in the source.",
    fix: "Declare the name with let before this use, in this block or in an enclosing one.",
  },
  [TuffErrorKind.DuplicateName]: {
    what: "Duplicate name",
    why: "This block already binds this name, and a name can be bound only once per block.",
    fix: "Rename one of the bindings. A nested block may shadow an outer name instead.",
  },
  [TuffErrorKind.InternalError]: {
    what: "Internal error",
    why: "The name resolver and the evaluator disagree about a binding. The source is not at fault.",
    fix: "Report this source text to the Tuff maintainers.",
  },
  [TuffErrorKind.ImmutableAssignment]: {
    what: "Assignment to an immutable binding",
    why: "This name was declared with let, so its value cannot change after it is bound.",
    fix: "Declare the binding with let mut, or bind a new name with let for the new value.",
  },
  [TuffErrorKind.BooleanOperand]: {
    what: "Boolean used as a number",
    why: "Arithmetic operators accept only numbers. true and false are booleans, not numbers.",
    fix: "Replace the boolean operand with a number.",
  },
};

/**
 * Explains a failure: what it is, where it occurred, why it is rejected, and how to fix it.
 *
 * @param error - The failure to explain.
 * @returns The explanation, with `where` set to the error's span.
 */
export function describeError(error: TuffError): ErrorExplanation {
  return { ...WORDING[error.kind], where: error.span };
}
