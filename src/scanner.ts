import { Bracket } from "./errors";

/**
 * The binary operators.
 */
export enum Operator {
  Add = "+",
  Subtract = "-",
  Multiply = "*",
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
 * Maps a character to a binary operator.
 *
 * @param ch - the character to map.
 * @returns the operator, or undefined when the character is not one.
 */
export function toOperator(ch: string): Operator | undefined {
  if (ch === "+") return Operator.Add;
  if (ch === "-") return Operator.Subtract;
  if (ch === "*") return Operator.Multiply;
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
