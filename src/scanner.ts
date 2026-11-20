import { Bracket } from "./errors";

/**
 * The binary operators.
 */
export enum Operator {
  /** Addition. */
  Add = "+",
  /** Subtraction. */
  Subtract = "-",
  /** Multiplication. */
  Multiply = "*",
  /** Less than. */
  LessThan = "<",
  /** Less than or equal. */
  LessEqual = "<=",
  /** Greater than. */
  GreaterThan = ">",
  /** Greater than or equal. */
  GreaterEqual = ">=",
  /** Equality. */
  Equal = "==",
  /** Inequality. */
  NotEqual = "!=",
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/**
 * Reports whether a character is an ASCII letter.
 *
 * @param ch - the character to test.
 * @returns true for `a` to `z` and `A` to `Z`.
 */
export function isLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isSpace(ch: string): boolean {
  return ch.length === 1 && ch.trim() === "";
}

/**
 * Maps the text at an offset to a binary operator. Two-character operators are
 * read with one character of lookahead.
 *
 * @param source - the program being parsed.
 * @param pos - the offset of the operator's first character.
 * @returns the operator, or undefined when the text there is not one.
 */
export function toOperator(source: string, pos: number): Operator | undefined {
  const ch = source.charAt(pos);
  const next = source.charAt(pos + 1);
  if (ch === "+") return Operator.Add;
  if (ch === "-") return Operator.Subtract;
  if (ch === "*") return Operator.Multiply;
  if (ch === "<") return next === "=" ? Operator.LessEqual : Operator.LessThan;
  if (ch === ">")
    return next === "=" ? Operator.GreaterEqual : Operator.GreaterThan;
  if (ch === "=") return next === "=" ? Operator.Equal : undefined;
  if (ch === "!") return next === "=" ? Operator.NotEqual : undefined;
  return undefined;
}

/**
 * Maps a character to an opening bracket.
 *
 * @param ch - the character to map.
 * @returns the bracket, or undefined when the character is not an opening bracket.
 */
export function toBracket(ch: string): Bracket | undefined {
  if (ch === "(") return Bracket.Paren;
  if (ch === "{") return Bracket.Brace;
  return undefined;
}

/**
 * Reports whether a character closes a bracket.
 *
 * @param ch - the character to test.
 * @returns true for `)` and `}`.
 */
export function isCloser(ch: string): boolean {
  return ch === ")" || ch === "}";
}

/**
 * Advances past whitespace.
 *
 * @param source - the program being parsed.
 * @param pos - the offset to start from.
 * @returns the offset of the first non-space character at or after `pos`.
 */
export function skipSpaces(source: string, pos: number): number {
  let idx = pos;
  while (isSpace(source.charAt(idx))) idx++;
  return idx;
}

/**
 * Advances past a run of digits.
 *
 * @param source - the program being parsed.
 * @param start - the offset to start from.
 * @returns the offset just after the digits.
 */
export function readDigits(source: string, start: number): number {
  let idx = start;
  while (isDigit(source.charAt(idx))) idx++;
  return idx;
}

/**
 * Advances past a run of letters.
 *
 * @param source - the program being parsed.
 * @param start - the offset to start from.
 * @returns the offset just after the letters.
 */
export function readName(source: string, start: number): number {
  let idx = start;
  while (isLetter(source.charAt(idx))) idx++;
  return idx;
}
