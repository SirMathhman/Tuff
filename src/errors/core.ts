/**
 * A syntax error: what went wrong, where, why, and how to fix it.
 */
export interface TuffError {
  /** What went wrong, as a short message. */
  what: string;
  /** Zero-based offset of the problem in the source. */
  where: number;
  /** The rule that was broken. */
  why: string;
  /** How to correct the source. */
  fix: string;
}

/**
 * A successful result, holding a value.
 */
export interface Success<T> {
  /** Always true for a success. */
  ok: true;
  /** The value on success. */
  value: T;
}

/**
 * A failed parse, holding the error.
 */
export interface Failure<E> {
  /** Always false for a failure. */
  ok: false;
  /** The error describing the failure. */
  error: E;
}

/**
 * The outcome of parsing: a value, or a failure with an error.
 */
export type Result<T, E> = Success<T> | Failure<E>;

/**
 * The two kinds of opening bracket.
 */
export enum Bracket {
  /** A parenthesized group, closed by `)`. */
  Paren = "(",
  /** A braced block, closed by `}`. */
  Brace = "{",
}

/**
 * Returns the closing character for a bracket.
 *
 * @param bracket - the opening bracket.
 * @returns the matching closing character.
 */
export function closerFor(bracket: Bracket): string {
  return bracket === Bracket.Paren ? ")" : "}";
}

function isSpace(ch: string): boolean {
  return ch.length === 1 && ch.trim() === "";
}

/**
 * Describes a character for an error message.
 *
 * @param ch - the character, or an empty string at the end of the input.
 * @returns a quoted character, or a word for whitespace or the end of the input.
 */
export function describe(ch: string): string {
  if (ch === "") return "the end of the input";
  if (isSpace(ch)) return "whitespace";
  return `'${ch}'`;
}

/**
 * Builds a failure with its four parts.
 *
 * @param what - what went wrong.
 * @param where - the offset of the error.
 * @param why - why it is an error.
 * @param fix - how to fix it.
 * @returns the failure.
 */
export function fail(
  what: string,
  where: number,
  why: string,
  fix: string,
): Failure<TuffError> {
  return { ok: false, error: { what, where, why, fix } };
}
