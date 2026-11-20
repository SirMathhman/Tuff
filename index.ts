import { err, ok, type Result } from "./src/result";

/**
 * A syntax error found at a specific offset in the source.
 */
interface Problem {
  /**
   * Zero-based offset of the first character that could not be parsed.
   */
  readonly offset: number;
  /**
   * Human-readable description of what the parser expected at that offset.
   */
  readonly expected: string;
}

/**
 * Mutable read position shared by the parsing functions.
 */
interface Cursor {
  /**
   * Zero-based offset of the next unread character.
   */
  pos: number;
}

/**
 * Interprets a Tuff program and returns its result.
 *
 * @param tuffSource - The Tuff source text to interpret.
 * @returns An Ok result with the numeric result of the program, or an Err result describing what is wrong, where, why, and how to fix it.
 */
export function interpretTuff(tuffSource: string): Result<number, string> {
  const result = parseProgram(tuffSource);
  if (result.ok) {
    return result;
  }
  return err(describeUnsupported(tuffSource, result.error));
}

/**
 * Parses the whole source as one expression.
 *
 * Grammar:
 *   expression := term (("+" | "-") term)*
 *   term       := factor ("*" factor)*
 *   factor     := number | "(" expression ")"
 *
 * Multiplication binds tighter than addition and subtraction, and parentheses
 * group sub-expressions. Whitespace between tokens is ignored.
 *
 * @param text - The source to parse.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseProgram(text: string): Result<number, Problem> {
  const cursor: Cursor = { pos: 0 };
  const value = parseExpression(text, cursor);
  if (!value.ok) {
    return value;
  }
  skipSpaces(text, cursor);
  if (cursor.pos < text.length) {
    return err({ offset: cursor.pos, expected: `"+", "-", "*" or end of input` });
  }
  return value;
}

/**
 * Parses an expression of terms joined by "+" or "-".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseExpression(text: string, cursor: Cursor): Result<number, Problem> {
  const first = parseTerm(text, cursor);
  if (!first.ok) {
    return first;
  }
  let value = first.value;
  for (;;) {
    const op = peek(text, cursor);
    if (op !== "+" && op !== "-") {
      return ok(value);
    }
    cursor.pos++;
    const right = parseTerm(text, cursor);
    if (!right.ok) {
      return right;
    }
    value = op === "+" ? value + right.value : value - right.value;
  }
}

/**
 * Parses a term of factors joined by "*".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseTerm(text: string, cursor: Cursor): Result<number, Problem> {
  const first = parseFactor(text, cursor);
  if (!first.ok) {
    return first;
  }
  let value = first.value;
  while (peek(text, cursor) === "*") {
    cursor.pos++;
    const right = parseFactor(text, cursor);
    if (!right.ok) {
      return right;
    }
    value *= right.value;
  }
  return ok(value);
}

/**
 * Parses a non-negative integer or a parenthesized expression.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseFactor(text: string, cursor: Cursor): Result<number, Problem> {
  const c = peek(text, cursor);
  if (c === "(") {
    cursor.pos++;
    const inner = parseExpression(text, cursor);
    if (!inner.ok) {
      return inner;
    }
    if (peek(text, cursor) !== ")") {
      return err({ offset: cursor.pos, expected: `")"` });
    }
    cursor.pos++;
    return inner;
  }
  if (!/\d/.test(c)) {
    return err({ offset: cursor.pos, expected: `a number or "("` });
  }
  const start = cursor.pos;
  while (/\d/.test(text.charAt(cursor.pos))) {
    cursor.pos++;
  }
  return ok(Number(text.slice(start, cursor.pos)));
}

/**
 * Skips whitespace and returns the next significant character.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns The next significant character, or "" at end of input.
 */
function peek(text: string, cursor: Cursor): string {
  skipSpaces(text, cursor);
  return text.charAt(cursor.pos);
}

/**
 * Advances the cursor past any whitespace.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position to advance.
 */
function skipSpaces(text: string, cursor: Cursor): void {
  while (/\s/.test(text.charAt(cursor.pos))) {
    cursor.pos++;
  }
}

/**
 * Builds an error message that states what is wrong, where it is, why it is
 * rejected, and how to fix it.
 *
 * @param tuffSource - The untrimmed source that failed to parse.
 * @param problem - The syntax problem with its offset and expectation.
 * @returns A multi-part message naming the location of the first offending character.
 */
function describeUnsupported(tuffSource: string, problem: Problem): string {
  const { line, column } = locate(tuffSource, problem.offset);
  const found =
    problem.offset < tuffSource.length
      ? `"${tuffSource.charAt(problem.offset)}"`
      : "end of input";
  return (
    `What: unsupported Tuff source. ` +
    `Where: line ${line}, column ${column}, found ${found} where ${problem.expected} was expected. ` +
    `Why: Tuff currently only evaluates non-negative integer literals combined with binary "+", "-", and "*", and parentheses for grouping. ` +
    `Fix: change the source to a form such as "1", "1 + 2 * 3", or "(1 + 2) * 3" (received ${JSON.stringify(tuffSource)}).`
  );
}

/**
 * Converts a zero-based offset into a one-based line and column.
 *
 * @param text - The text containing the offset.
 * @param offset - The zero-based offset to locate.
 * @returns The one-based line and column of the offset.
 */
function locate(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charAt(i) === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}
