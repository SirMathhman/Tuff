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
 * A value of a Tuff expression: a number, or a boolean from "true" or "false".
 * Values of different types are never equal.
 */
type Value = number | boolean;

/**
 * Words with a fixed meaning that cannot be used as variable names.
 * "true" evaluates to 1 and "false" to 0.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set(["let", "mut", "true", "false"]);

/**
 * A variable's current value and whether it may be reassigned.
 */
interface Binding {
  /**
   * The variable's current value.
   */
  value: Value;
  /**
   * True if the variable was declared with "let mut" and may be assigned.
   */
  readonly mutable: boolean;
}

/**
 * A set of variables introduced by one block, linked to the enclosing block.
 */
interface Scope {
  /**
   * Variables declared directly in this block.
   */
  readonly vars: Map<string, Binding>;
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
    return ok(typeof result.value === "boolean" ? (result.value ? 1 : 0) : result.value);
  }
  return err(describeUnsupported(tuffSource, result.error));
}

/**
 * Parses the whole source as one expression.
 *
 * Grammar:
 *   program    := statement* expression
 *   block      := "{" statement* expression "}"
 *   statement  := "let" ["mut"] name "=" expression ";" | name "=" expression ";"
 *   expression := sum ("==" sum)*
 *   sum        := term (("+" | "-") term)*
 *   term       := factor ("*" factor)*
 *   factor     := number | "true" | "false" | name | "(" expression ")" | block
 *
 * Multiplication binds tighter than addition and subtraction, and parentheses
 * group sub-expressions. "true" and "false" evaluate to 1 and 0, and "==" yields
 * 1 or 0. "let" declares a variable and the final expression
 * is the value; a block's variables are visible only inside that block. Only
 * variables declared with "let mut" may be assigned. Whitespace between tokens
 * is ignored.
 *
 * @param text - The source to parse.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseProgram(text: string): Result<Value, Problem> {
  const cursor: Cursor = { pos: 0, scope: { vars: new Map(), parent: undefined } };
  const value = parseBlockBody(text, cursor);
  if (!value.ok) {
    return value;
  }
  skipSpaces(text, cursor);
  if (cursor.pos < text.length) {
    return err({ offset: cursor.pos, expected: `"+", "-", "*", "==" or end of input` });
  }
  return value;
}

/**
 * Parses an expression: sums compared with "==". The comparison yields 1 when
 * the sides are equal and 0 otherwise.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseExpression(text: string, cursor: Cursor): Result<Value, Problem> {
  const first = parseSum(text, cursor);
  if (!first.ok) {
    return first;
  }
  let value: Value = first.value;
  while (peekOperator(text, cursor) === "==") {
    const opOffset = cursor.pos;
    cursor.pos += 2;
    const right = parseSum(text, cursor);
    if (!right.ok) {
      return right;
    }
    if (typeof value !== typeof right.value) {
      return err({ offset: opOffset, expected: `a value of the same type as the left side of "=="` });
    }
    value = value === right.value ? 1 : 0;
  }
  return ok(value);
}

/**
 * Parses a sum of terms joined by "+" or "-".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseSum(text: string, cursor: Cursor): Result<Value, Problem> {
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
    const opOffset = cursor.pos;
    cursor.pos++;
    const right = parseTerm(text, cursor);
    if (!right.ok) {
      return right;
    }
    if (typeof value !== "number" || typeof right.value !== "number") {
      return err({ offset: opOffset, expected: `a number on each side of "${op}"` });
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
function parseTerm(text: string, cursor: Cursor): Result<Value, Problem> {
  const first = parseFactor(text, cursor);
  if (!first.ok) {
    return first;
  }
  let value = first.value;
  while (peek(text, cursor) === "*") {
    const opOffset = cursor.pos;
    cursor.pos++;
    const right = parseFactor(text, cursor);
    if (!right.ok) {
      return right;
    }
    if (typeof value !== "number" || typeof right.value !== "number") {
      return err({ offset: opOffset, expected: `a number on each side of "*"` });
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
function parseFactor(text: string, cursor: Cursor): Result<Value, Problem> {
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
    if (name === "true" || name === "false") {
      return ok(name === "true");
    }
    const binding = lookup(cursor.scope, name);
    if (binding === undefined) {
      return err({ offset: start, expected: `a variable in scope (no "${name}" is defined)` });
    }
    return ok(binding.value);
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
function parseBlock(text: string, cursor: Cursor): Result<Value, Problem> {
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
 * Parses the statements and final expression inside a block or program.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value of the final expression, or an Err result with the first problem found.
 */
function parseBlockBody(text: string, cursor: Cursor): Result<Value, Problem> {
  for (;;) {
    const name = peekName(text, cursor);
    let problem: Problem | undefined;
    if (name === "let") {
      problem = parseDeclaration(text, cursor);
    } else if (name !== "" && peekAfterName(text, cursor, name) === "=") {
      problem = parseAssignment(text, cursor);
    } else {
      break;
    }
    if (problem !== undefined) {
      return err(problem);
    }
  }
  return parseExpression(text, cursor);
}

/**
 * Parses a "let" declaration, optionally "mut", and records the variable in the current scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the declaration.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
function parseDeclaration(text: string, cursor: Cursor): Problem | undefined {
  cursor.pos += "let".length;
  let mutable = false;
  if (peekName(text, cursor) === "mut") {
    cursor.pos += "mut".length;
    mutable = true;
  }
  const name = peekName(text, cursor);
  if (name === "" || RESERVED_WORDS.has(name)) {
    return { offset: cursor.pos, expected: "a variable name" };
  }
  cursor.pos += name.length;
  if (peek(text, cursor) !== "=") {
    return { offset: cursor.pos, expected: `"="` };
  }
  cursor.pos++;
  const value = parseExpression(text, cursor);
  if (!value.ok) {
    return value.error;
  }
  if (peek(text, cursor) !== ";") {
    return { offset: cursor.pos, expected: `";"` };
  }
  cursor.pos++;
  cursor.scope.vars.set(name, { value: value.value, mutable });
  return undefined;
}

/**
 * Parses an assignment to a variable declared with "let mut".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the assignment.
 * @returns The first problem found, or undefined if the assignment parsed.
 */
function parseAssignment(text: string, cursor: Cursor): Problem | undefined {
  const name = peekName(text, cursor);
  const start = cursor.pos;
  cursor.pos += name.length;
  const binding = lookup(cursor.scope, name);
  if (binding === undefined) {
    return { offset: start, expected: `a variable in scope (no "${name}" is defined)` };
  }
  if (!binding.mutable) {
    return { offset: start, expected: `a mutable variable (declare "${name}" with "let mut")` };
  }
  peek(text, cursor);
  cursor.pos++;
  peek(text, cursor);
  const valueStart = cursor.pos;
  const value = parseExpression(text, cursor);
  if (!value.ok) {
    return value.error;
  }
  if (typeof value.value !== typeof binding.value) {
    const kind = typeof binding.value === "number" ? "a number" : "a boolean";
    return { offset: valueStart, expected: `${kind} to match the type of "${name}"` };
  }
  if (peek(text, cursor) !== ";") {
    return { offset: cursor.pos, expected: `";"` };
  }
  cursor.pos++;
  binding.value = value.value;
  return undefined;
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
function peekAfterName(text: string, cursor: Cursor, name: string): string {
  const saved = cursor.pos;
  cursor.pos += name.length;
  const after = peek(text, cursor);
  const result = after === "=" && text.charAt(cursor.pos + 1) === "=" ? "==" : after;
  cursor.pos = saved;
  return result;
}

/**
 * Returns the two-character operator at the next significant position, without consuming it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns "==" if it is next, otherwise "".
 */
function peekOperator(text: string, cursor: Cursor): string {
  skipSpaces(text, cursor);
  return text.slice(cursor.pos, cursor.pos + 2) === "==" ? "==" : "";
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
 * @returns The binding of the nearest declaration of the name, or undefined if none is in scope.
 */
function lookup(scope: Scope | undefined, name: string): Binding | undefined {
  for (let s = scope; s !== undefined; s = s.parent) {
    const binding = s.vars.get(name);
    if (binding !== undefined) {
      return binding;
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
    `Why: Tuff currently only evaluates non-negative integer literals, the booleans true (1) and false (0), variables declared with "let" (assignable only when declared with "let mut"), binary "+", "-", and "*", and parentheses or braces for grouping. ` +
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
