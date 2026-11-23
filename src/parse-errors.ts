import { textAt, type Token } from "./tokenizer.ts";
import { err, type Err, type ErrorWhere, type Result, type TuffError } from "./errors.ts";
import { type Expr } from "./ast.ts";

export const MAX_NESTING_DEPTH = 1000;

interface Parsed {
  value: Expr;
  next: number;
}

export type Parse = Result<Parsed, TuffError>;

export type ExprRule = (tokens: Token[], pos: number, depth: number) => Parse;

/**
 * A comparison-level rule that receives the full rule set, so it can be passed as a value.
 */
export type ComparisonRule = (tokens: Token[], pos: number, depth: number, rules: ParseRules) => Parse;

/**
 * The rules a parser function needs from above, passed as a parameter so no function calls a rule by name.
 */
export interface ParseRules {
  /** The full expression rule, used for groups and branches. */
  expr: ExprRule;
  /** The comparison rule, used for the else branch of an if. */
  comparison: ComparisonRule;
}

/**
 * Builds the location of a token, using an empty text at the end of the input.
 * @param tokens - The token list being parsed.
 * @param index - The position of the token.
 * @returns The index and text of the token.
 */
export function whereAt(tokens: Token[], index: number): ErrorWhere {
  return { index, text: textAt(tokens, index) ?? "" };
}

/**
 * Builds an InvalidTerm error for a token the grammar does not allow at a position.
 * @param tokens - The token list being parsed.
 * @param index - The position of the unexpected token.
 * @param expected - A description of what the grammar expected there.
 * @param fix - How the user can correct the input.
 * @returns An Err result holding the InvalidTerm error.
 */
export function invalidAt(
  tokens: Token[],
  index: number,
  expected: string,
  fix: string,
): Err<TuffError> {
  const where = whereAt(tokens, index);
  const found =
    where.text === "" ? "the end of the input" : JSON.stringify(where.text);

  return err({
    kind: "InvalidTerm",
    why: `Expected ${expected} but found ${found}.`,
    where,
    fix,
  });
}

/**
 * Builds a TermTooLarge error for a number literal above the safe integer range.
 * @param tokens - The token list being parsed.
 * @param index - The position of the literal.
 * @returns An Err result holding the TermTooLarge error.
 */
export function termTooLargeAt(tokens: Token[], index: number): Err<TuffError> {
  const where = whereAt(tokens, index);

  return err({
    kind: "TermTooLarge",
    why: `${JSON.stringify(where.text)} is larger than ${Number.MAX_SAFE_INTEGER}, so it cannot be stored exactly.`,
    where,
    fix: `Use an integer of at most ${Number.MAX_SAFE_INTEGER}.`,
  });
}

/**
 * Builds a NestingTooDeep error for groups nested beyond the depth limit.
 * @param tokens - The token list being parsed.
 * @param index - The position of the group that exceeds the limit.
 * @returns An Err result holding the NestingTooDeep error.
 */
export function nestingTooDeepAt(tokens: Token[], index: number): Err<TuffError> {
  return err({
    kind: "NestingTooDeep",
    why: `Groups nest deeper than ${MAX_NESTING_DEPTH} levels.`,
    where: whereAt(tokens, index),
    fix: `Reduce the nesting to at most ${MAX_NESTING_DEPTH} levels.`,
  });
}
