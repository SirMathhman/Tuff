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
 * A set of variables introduced by one block, linked to the enclosing block.
 */
interface Scope {
  /**
   * Values of the variables declared directly in this block.
   */
  readonly vars: Map<string, number>;
  /**
   * The enclosing scope, or undefined for the program's outermost scope.
   */
  readonly parent: Scope | undefined;
}

/**
 * Mutable read position shared by the parsing functions.
 */
interface Cursor {
  /**
   * Zero-based offset of the next unread character.
   */
  pos: number;
  /**
   * The innermost scope whose variables are visible at the current position.
   */
  scope: Scope;
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
 *   factor     := number | name | "(" expression ")" | block
 *   block      := "{" ("let" name "=" expression ";")* expression "}"
 *
 * Multiplication binds tighter than addition and subtraction, and parentheses
 * group sub-expressions. A block declares variables with "let" and evaluates
 * to its final expression; variables are visible only inside the block that
 * declares them. Whitespace between tokens is ignored.
 *
 * @param text - The source to parse.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseProgram(text: string): Result<number, Problem> {
  const cursor: Cursor = { pos: 0, scope: { vars: new Map(), parent: undefined } };
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
 * Parses a non-negative integer, a variable, a parenthesized expression, or a block.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseFactor(text: string, cursor: Cursor): Result<number, Problem> {
  const c = peek(text, cursor);
  if (c === "{") {
    return parseBlock(text, cursor);
  }
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
  const name = peekName(text, cursor);
  if (name !== "") {
    const start = cursor.pos;
    cursor.pos += name.length;
    const value = lookup(cursor.scope, name);
    if (value === undefined) {
      return err({ offset: start, expected: `a variable in scope (no "${name}" is defined)` });
    }
    return ok(value);
  }
  if (!/\d/.test(c)) {
    return err({ offset: cursor.pos, expected: `a number, a variable, "(" or "{"` });
  }
  const start = cursor.pos;
  while (/\d/.test(text.charAt(cursor.pos))) {
    cursor.pos++;
  }
  return ok(Number(text.slice(start, cursor.pos)));
}

/**
 * Parses a block: optional "let" declarations followed by a final expression,
 * all enclosed in braces. The declarations live in a new scope that ends with the block.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the block.
 * @returns An Ok result with the value of the final expression, or an Err result with the first problem found.
 */
function parseBlock(text: string, cursor: Cursor): Result<number, Problem> {
  cursor.pos++;
  const outer = cursor.scope;
  cursor.scope = { vars: new Map(), parent: outer };
  const result = parseBlockBody(text, cursor);
  cursor.scope = outer;
  if (!result.ok) {
    return result;
  }
  if (peek(text, cursor) !== "}") {
    return err({ offset: cursor.pos, expected: `"}"` });
  }
  cursor.pos++;
  return result;
}

/**
 * Parses the "let" declarations and final expression inside a block, recording
 * each declared variable in the cursor's current scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value of the final expression, or an Err result with the first problem found.
 */
function parseBlockBody(text: string, cursor: Cursor): Result<number, Problem> {
  while (peekName(text, cursor) === "let") {
    cursor.pos += "let".length;
    const name = peekName(text, cursor);
    if (name === "") {
      return err({ offset: cursor.pos, expected: "a variable name" });
    }
    cursor.pos += name.length;
    if (peek(text, cursor) !== "=") {
      return err({ offset: cursor.pos, expected: `"="` });
    }
    cursor.pos++;
    const value = parseExpression(text, cursor);
    if (!value.ok) {
      return value;
    }
    if (peek(text, cursor) !== ";") {
      return err({ offset: cursor.pos, expected: `";"` });
    }
    cursor.pos++;
    cursor.scope.vars.set(name, value.value);
  }
  return parseExpression(text, cursor);
}

/**
 * Returns the identifier starting at the next significant character without consuming it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns The identifier, or "" if the next significant character cannot start one.
 */
function peekName(text: string, cursor: Cursor): string {
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
 * Finds the value of a variable in the given scope or the scopes enclosing it.
 *
 * @param scope - The innermost scope to search first.
 * @param name - The variable name to look up.
 * @returns The value of the nearest declaration of the name, or undefined if none is in scope.
 */
function lookup(scope: Scope | undefined, name: string): number | undefined {
  for (let s = scope; s !== undefined; s = s.parent) {
    const value = s.vars.get(name);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
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
    `Why: Tuff currently only evaluates non-negative integer literals, variables declared with "let" inside braces, binary "+", "-", and "*", and parentheses or braces for grouping. ` +
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
