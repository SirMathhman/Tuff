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
 * A value of a Tuff expression: a number, a boolean from "true" or "false", or a reference.
 * Values of different types are never equal.
 */
type Value = number | boolean | Reference;

/**
 * A reference made with "&name" or "&mut name". Reading it with "*" gives the target's
 * current value; only a mutable reference can be assigned through with "*name = ...".
 */
interface Reference {
  /**
   * The variable the reference points to.
   */
  readonly target: Binding;
  /**
   * True if the reference was made with "&mut".
   */
  readonly mutable: boolean;
}

/**
 * Words with a fixed meaning that cannot be used as variable names.
 * "true" evaluates to 1 and "false" to 0.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set(["let", "mut", "true", "false", "if", "else"]);

/**
 * Message for a value that would make a reference outlive the variable it points to.
 */
const OUTLIVES_MESSAGE = "a value that does not refer to a variable declared inside a deeper block";

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
  /**
   * Nesting depth of the scope that declares the variable; the program's scope is 0.
   */
  readonly depth: number;
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
  /**
   * Nesting depth of this scope; the program's scope is 0.
   */
  readonly depth: number;
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
  /**
   * True inside a branch of "if" that is not taken: it is checked but its assignments do not run.
   */
  dead: boolean;
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
    const value = result.value;
    if (typeof value === "boolean") {
      return ok(value ? 1 : 0);
    }
    return ok(value);
  }
  return err(describeUnsupported(tuffSource, result.error));
}

/**
 * Parses the whole source as one expression.
 *
 * Grammar:
 *   program    := statement* expression
 *   block      := "{" statement* expression "}"
 *   statement  := "let" ["mut"] name "=" expression ";" | name "=" expression ";" | "*" factor "=" expression ";"
 *   expression := sum ("==" sum)*
 *   sum        := term (("+" | "-") term)*
 *   term       := factor ("*" factor)*
 *   factor     := number | "true" | "false" | name | "&" ["mut"] name | "*" factor | "(" expression ")" | block
 *               | "if" "(" expression ")" expression "else" expression
 *
 * Multiplication binds tighter than addition and subtraction, and parentheses
 * group sub-expressions. "true" and "false" evaluate to 1 and 0, and "==" yields
 * 1 or 0. "let" declares a variable and the final expression
 * is the value; a block's variables are visible only inside that block. Only
 * variables declared with "let mut" may be assigned. "&name" makes a reference
 * to a variable and "*" reads through one; a reference may not outlive the
 * variable it points to. Whitespace between tokens is ignored.
 *
 * @param text - The source to parse.
 * @returns An Ok result with the number or boolean result, or an Err result with the first problem found.
 */
function parseProgram(text: string): Result<number | boolean, Problem> {
  const cursor: Cursor = { pos: 0, scope: { vars: new Map(), parent: undefined, depth: 0 }, dead: false };
  const value = parseBlockBody(text, cursor);
  if (!value.ok) {
    return value;
  }
  skipSpaces(text, cursor);
  if (cursor.pos < text.length) {
    return err({ offset: cursor.pos, expected: `"+", "-", "*", "==" or end of input` });
  }
  const result = value.value;
  if (typeof result === "object") {
    return err({ offset: cursor.pos, expected: `a number or boolean as the program's result` });
  }
  return ok(result);
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
  while (true) {
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
  if (c === "&") {
    return parseReference(text, cursor);
  }
  if (c === "*") {
    return parseDereference(text, cursor);
  }
  const name = peekName(text, cursor);
  if (name !== "") {
    const start = cursor.pos;
    cursor.pos += name.length;
    if (name === "true" || name === "false") {
      return ok(name === "true");
    }
    if (name === "if") {
      return parseIf(text, cursor);
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
  const blockStart = cursor.pos;
  cursor.pos++;
  const outer = cursor.scope;
  cursor.scope = { vars: new Map(), parent: outer, depth: outer.depth + 1 };
  const result = parseBlockBody(text, cursor);
  cursor.scope = outer;
  if (!result.ok) {
    return result;
  }
  if (peek(text, cursor) !== "}") {
    return err({ offset: cursor.pos, expected: `"}"` });
  }
  cursor.pos++;
  if (escapes(result.value, outer.depth)) {
    return err({ offset: blockStart, expected: `a value that does not refer to a variable declared inside the block` });
  }
  return result;
}

/**
 * Parses "if (condition) then-expression else else-expression" after the "if" keyword.
 * Both branches are parsed and checked, but only the chosen one takes effect: assignments
 * in the other branch are checked and then skipped.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the expression.
 * @returns An Ok result with the chosen branch's value, or an Err result with the first problem found.
 */
function parseIf(text: string, cursor: Cursor): Result<Value, Problem> {
  if (peek(text, cursor) !== "(") {
    return err({ offset: cursor.pos, expected: `"("` });
  }
  cursor.pos++;
  peek(text, cursor);
  const conditionStart = cursor.pos;
  const condition = parseExpression(text, cursor);
  if (!condition.ok) {
    return condition;
  }
  if (typeof condition.value !== "boolean") {
    return err({ offset: conditionStart, expected: "a boolean condition" });
  }
  if (peek(text, cursor) !== ")") {
    return err({ offset: cursor.pos, expected: `")"` });
  }
  cursor.pos++;
  const outerDead = cursor.dead;
  const thenResult = parseBranch(text, cursor, outerDead || !condition.value);
  if (!thenResult.ok) {
    return thenResult;
  }
  if (peekName(text, cursor) !== "else") {
    return err({ offset: cursor.pos, expected: `"else"` });
  }
  cursor.pos += "else".length;
  const elseResult = parseBranch(text, cursor, outerDead || condition.value);
  if (!elseResult.ok) {
    return elseResult;
  }
  return condition.value ? thenResult : elseResult;
}

/**
 * Parses one branch of an "if" expression, marking it dead when it is not the branch taken.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the branch.
 * @param dead - True if this branch is not taken.
 * @returns An Ok result with the branch's value, or an Err result with the first problem found.
 */
function parseBranch(text: string, cursor: Cursor, dead: boolean): Result<Value, Problem> {
  const outerDead = cursor.dead;
  cursor.dead = dead;
  const result = parseExpression(text, cursor);
  cursor.dead = outerDead;
  return result;
}

/**
 * Parses "&name" or "&mut name", a reference to a variable in scope. A mutable
 * reference requires the variable to be declared with "let mut".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the reference.
 * @returns An Ok result with the reference, or an Err result with the first problem found.
 */
function parseReference(text: string, cursor: Cursor): Result<Value, Problem> {
  cursor.pos++;
  let mutable = false;
  if (peekName(text, cursor) === "mut") {
    cursor.pos += "mut".length;
    mutable = true;
  }
  const name = peekName(text, cursor);
  if (name === "") {
    return err({ offset: cursor.pos, expected: `a variable name after "&"` });
  }
  const start = cursor.pos;
  cursor.pos += name.length;
  const binding = lookup(cursor.scope, name);
  if (binding === undefined) {
    return err({ offset: start, expected: `a variable in scope (no "${name}" is defined)` });
  }
  if (mutable && !binding.mutable) {
    return err({ offset: start, expected: `a mutable variable (declare "${name}" with "let mut") to borrow mutably` });
  }
  return ok({ target: binding, mutable });
}

/**
 * Reports whether the statement starting at the given offset assigns through a reference,
 * that is, whether a "=" (not "==") follows the "*" target before the statement ends.
 * Only scans characters; it does not parse or evaluate anything.
 *
 * @param text - The source being parsed.
 * @param start - Offset of the leading "*".
 * @returns True if the statement is "*target = ...".
 */
function isDereferenceAssignment(text: string, start: number): boolean {
  if (text.charAt(start) !== "*") {
    return false;
  }
  let depth = 0;
  for (let i = start + 1; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === "(" || c === "{") {
      depth++;
    } else if (c === ")" || c === "}") {
      if (depth === 0) {
        return false;
      }
      depth--;
    } else if (depth === 0 && c === ";") {
      return false;
    } else if (depth === 0 && c === "=") {
      return text.charAt(i + 1) !== "=";
    }
  }
  return false;
}

/**
 * Parses "*target = expression;", which assigns through a mutable reference. The target
 * is any factor that evaluates to a reference, such as "*y" or "*(*z)".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the assignment.
 * @returns The first problem found, or undefined if the assignment parsed.
 */
function parseDereferenceAssignment(text: string, cursor: Cursor): Problem | undefined {
  peek(text, cursor);
  const starOffset = cursor.pos;
  cursor.pos++;
  const target = parseFactor(text, cursor);
  if (!target.ok) {
    return target.error;
  }
  const ref = target.value;
  if (typeof ref !== "object") {
    return { offset: starOffset, expected: `a reference after "*"` };
  }
  if (!ref.mutable) {
    return { offset: starOffset, expected: `a mutable reference (made with "&mut") to assign through` };
  }
  const init = parseInitializer(text, cursor, (value, offset) =>
    checkStore(value, offset, ref.target, "the referenced variable"),
  );
  if (!init.ok) {
    return init.error;
  }
  if (!cursor.dead) {
    ref.target.value = init.value;
  }
  return undefined;
}

/**
 * Parses "*" followed by a factor that must be a reference, and yields the target's value.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the dereference.
 * @returns An Ok result with the target's value, or an Err result with the first problem found.
 */
function parseDereference(text: string, cursor: Cursor): Result<Value, Problem> {
  const starOffset = cursor.pos;
  cursor.pos++;
  const inner = parseFactor(text, cursor);
  if (!inner.ok) {
    return inner;
  }
  if (typeof inner.value !== "object") {
    return err({ offset: starOffset, expected: `a reference after "*"` });
  }
  return ok(inner.value.target.value);
}

/**
 * Reports whether a value is a reference to a variable declared deeper than the given depth,
 * so that storing it at that depth would let it outlive its variable.
 *
 * @param value - The value being stored or returned.
 * @param depth - The depth of the scope that will hold the value.
 * @returns True if the value is a reference that would outlive its target.
 */
function escapes(value: Value, depth: number): boolean {
  return typeof value === "object" && value.target.depth > depth;
}

/**
 * Parses "= expression;" after an assignment target, and checks the value before accepting it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the initializer.
 * @param check - Returns a problem if the value may not be stored, given its offset.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseInitializer(
  text: string,
  cursor: Cursor,
  check: (value: Value, offset: number) => Problem | undefined,
): Result<Value, Problem> {
  if (peek(text, cursor) !== "=") {
    return err({ offset: cursor.pos, expected: `"="` });
  }
  cursor.pos++;
  peek(text, cursor);
  const valueStart = cursor.pos;
  const value = parseExpression(text, cursor);
  if (!value.ok) {
    return value;
  }
  const problem = check(value.value, valueStart);
  if (problem !== undefined) {
    return err(problem);
  }
  if (peek(text, cursor) !== ";") {
    return err({ offset: cursor.pos, expected: `";"` });
  }
  cursor.pos++;
  return value;
}

/**
 * Checks that a value may be stored in a variable: it must have the variable's type, and
 * a reference must not outlive the variable it points to.
 *
 * @param value - The value to store.
 * @param offset - Offset of the value's first character, for error reporting.
 * @param target - The variable that will receive the value.
 * @param description - How the variable is named in the error message.
 * @returns The problem found, or undefined if the value may be stored.
 */
function checkStore(value: Value, offset: number, target: Binding, description: string): Problem | undefined {
  if (typeof value !== typeof target.value) {
    return { offset, expected: `${kindOf(target.value)} to match the type of ${description}` };
  }
  if (escapes(value, target.depth)) {
    return { offset, expected: OUTLIVES_MESSAGE };
  }
  return undefined;
}

/**
 * Describes the kind of a value for error messages.
 *
 * @param value - The value to describe.
 * @returns "a number", "a boolean", or "a reference".
 */
function kindOf(value: Value): string {
  if (typeof value === "number") {
    return "a number";
  }
  return typeof value === "boolean" ? "a boolean" : "a reference";
}

/**
 * Parses the statements and final expression inside a block or program.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @returns An Ok result with the value of the final expression, or an Err result with the first problem found.
 */
function parseBlockBody(text: string, cursor: Cursor): Result<Value, Problem> {
  while (true) {
    const name = peekName(text, cursor);
    let problem: Problem | undefined;
    if (name === "let") {
      problem = parseDeclaration(text, cursor);
    } else if (name !== "" && peekAfterName(text, cursor, name) === "=") {
      problem = parseAssignment(text, cursor);
    } else if (name === "" && isDereferenceAssignment(text, peekStart(text, cursor))) {
      problem = parseDereferenceAssignment(text, cursor);
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
  const depth = cursor.scope.depth;
  const init = parseInitializer(text, cursor, (value, offset) =>
    escapes(value, depth) ? { offset, expected: OUTLIVES_MESSAGE } : undefined,
  );
  if (!init.ok) {
    return init.error;
  }
  cursor.scope.vars.set(name, { value: init.value, mutable, depth });
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
  const init = parseInitializer(text, cursor, (value, offset) => checkStore(value, offset, binding, `"${name}"`));
  if (!init.ok) {
    return init.error;
  }
  if (!cursor.dead) {
    binding.value = init.value;
  }
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
 * Returns the position of the next significant character without consuming it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns The offset of the next significant character.
 */
function peekStart(text: string, cursor: Cursor): number {
  skipSpaces(text, cursor);
  return cursor.pos;
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
