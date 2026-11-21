/**
 * Lexing helpers and error reporting for the Tuff interpreter. These read characters at a
 * position and never evaluate anything.
 */

/**
 * A syntax error found at a specific offset in the source.
 */
export interface Problem {
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
 * A one-based position in source text.
 */
export interface Location {
  /**
   * One-based line number.
   */
  readonly line: number;
  /**
   * One-based column number.
   */
  readonly column: number;
}

/**
 * A read position in source text.
 */
export interface Position {
  /**
   * Zero-based offset of the next unread character.
   */
  pos: number;
}

/**
 * Advances the cursor past any whitespace.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position to advance.
 */
export function skipSpaces(text: string, cursor: Position): void {
  while (true) {
    if (/\s/.test(text.charAt(cursor.pos))) {
      cursor.pos++;
    } else if (text.startsWith("//", cursor.pos)) {
      const newline = text.indexOf("\n", cursor.pos);
      cursor.pos = newline < 0 ? text.length : newline + 1;
    } else if (text.startsWith("/*", cursor.pos)) {
      const close = text.indexOf("*/", cursor.pos + 2);
      cursor.pos = close < 0 ? text.length : close + 2;
    } else {
      return;
    }
  }
}

/**
 * Skips whitespace and returns the next significant character.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns The next significant character, or "" at end of input.
 */
export function peek(text: string, cursor: Position): string {
  skipSpaces(text, cursor);
  return text.charAt(cursor.pos);
}

/**
 * Returns the identifier starting at the next significant character without consuming it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns The identifier, or "" if the next significant character cannot start one.
 */
export function peekName(text: string, cursor: Position): string {
  skipSpaces(text, cursor);
  if (!/[A-Za-z_]/.test(text.charAt(cursor.pos))) {
    return "";
  }
  let end = cursor.pos;
  while (/[A-Za-z0-9_]/.test(text.charAt(end))) {
    end++;
  }
  return text.slice(cursor.pos, end);
}

/**
 * Returns the position of the next significant character without consuming it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns The offset of the next significant character.
 */
export function peekStart(text: string, cursor: Position): number {
  skipSpaces(text, cursor);
  return cursor.pos;
}

/**
 * Returns the comparison operator at the next significant position, without consuming it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns "==" or "<" if one is next, otherwise "".
 */
export function peekOperator(text: string, cursor: Position): string {
  skipSpaces(text, cursor);
  if (text.slice(cursor.pos, cursor.pos + 2) === "==") {
    return "==";
  }
  return text.charAt(cursor.pos) === "<" ? "<" : "";
}

/**
 * Returns the significant character that follows a name, without moving the cursor.
 * A "==" comparison is reported as "==" so it is not mistaken for an assignment.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, which is left unchanged.
 * @param name - The name that starts at the cursor's next significant character.
 * @returns The next significant character after the name, or "" at end of input.
 */
export function peekAfterName(text: string, cursor: Position, name: string): string {
  const saved = cursor.pos;
  cursor.pos += name.length;
  const after = peek(text, cursor);
  const result = after === "=" && text.charAt(cursor.pos + 1) === "=" ? "==" : after;
  cursor.pos = saved;
  return result;
}

/**
 * Returns the compound-assignment operator ("+", "-" or "*") that follows a name, as in "x += 1",
 * without moving the cursor.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, which is left unchanged.
 * @param name - The name that starts at the cursor's next significant character.
 * @returns The operator, or "" if the name is not followed by a compound assignment.
 */
export function peekCompoundOperator(text: string, cursor: Position, name: string): string {
  const saved = cursor.pos;
  cursor.pos += name.length;
  const op = peek(text, cursor);
  const isCompound = (op === "+" || op === "-" || op === "*") && text.charAt(cursor.pos + 1) === "=";
  cursor.pos = saved;
  return isCompound ? op : "";
}

/**
 * Builds an error message that states what is wrong, where it is, why it is
 * rejected, and how to fix it.
 *
 * @param tuffSource - The untrimmed source that failed to parse.
 * @param problem - The syntax problem with its offset and expectation.
 * @returns A multi-part message naming the location of the first offending character.
 */
export function describeUnsupported(tuffSource: string, problem: Problem): string {
  const { line, column } = locate(tuffSource, problem.offset);
  const found = problem.offset < tuffSource.length ? `"${tuffSource.charAt(problem.offset)}"` : "end of input";
  return (
    `What: unsupported Tuff source. ` +
    `Where: line ${line}, column ${column}, found ${found} where ${problem.expected} was expected. ` +
    `Why: Tuff currently only evaluates non-negative integer literals, the booleans true (1) and false (0), variables declared with "let" (assignable only when declared with "let mut"), references with "&name" read back with "*", binary "+", "-", and "*", and parentheses or braces for grouping. ` +
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
export function locate(text: string, offset: number): Location {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text.charAt(index) === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/**
 * Finds the first character at or after start, outside any brackets, that satisfies a test.
 * Stops with -1 at an unmatched closing bracket or the end of the text. Only scans characters.
 *
 * @param text - The source being scanned.
 * @param start - Offset to start scanning from.
 * @param isTarget - Returns true for the character sought.
 * @returns The offset of the first match, or -1.
 */
export function findTopLevel(
  text: string,
  start: number,
  isTarget: (character: string, index: number) => boolean,
): number {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    const character = text.charAt(index);
    if (depth === 0 && isTarget(character, index)) {
      return index;
    }
    if (character === "(" || character === "{") {
      depth++;
    } else if (character === ")" || character === "}") {
      if (depth === 0) {
        return -1;
      }
      depth--;
    }
  }
  return -1;
}

/**
 * Consumes a "," between list items, or checks that the list ends at the closer.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position after an item, advanced past a ",".
 * @param closer - The character that ends the list, such as "}".
 * @returns A problem if the next character is neither "," nor the closer, otherwise undefined.
 */
export function consumeListSeparator(text: string, cursor: Position, closer: string): Problem | undefined {
  if (peek(text, cursor) === ",") {
    cursor.pos++;
    return undefined;
  }
  if (peek(text, cursor) !== closer) {
    return { offset: cursor.pos, expected: `"," or "${closer}"` };
  }
  return undefined;
}
