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
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  "let",
  "mut",
  "true",
  "false",
  "if",
  "else",
  "while",
  "match",
  "case",
  "_",
]);

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
  readonly parent?: Scope;
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
 * Outcome of trying to parse one statement: either no statement starts here, or one was
 * parsed, possibly with a problem.
 */
type StatementStep = NoStatement | ParsedStatement;

/**
 * Outcome when no statement starts at the cursor.
 */
interface NoStatement {
  /**
   * Always false for this outcome.
   */
  readonly matched: false;
}

/**
 * Outcome when a statement was parsed.
 */
interface ParsedStatement {
  /**
   * Always true for this outcome.
   */
  readonly matched: true;
  /**
   * The first problem found in the statement, or undefined if it parsed.
   */
  readonly problem?: Problem;
}

/**
 * A variable found by name in the source.
 */
interface NamedVariable {
  /**
   * The variable's name.
   */
  readonly name: string;
  /**
   * Offset of the variable's name in the source.
   */
  readonly start: number;
  /**
   * The variable's binding.
   */
  readonly binding: Binding;
}

/**
 * A one-based position in source text.
 */
interface Location {
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
 *               | name ("+=" | "-=" | "*=") expression ";"   (numeric variables declared with "let mut")
 *               | "{" statement* "}"   (a block with no final expression)
 *               | "if" "(" expression ")" statement ["else" statement]   (branches are non-declaration statements)
 *               | "while" "(" expression ")" statement   (re-run until the condition is false, up to a limit)
 *   match      := "match" "(" expression ")" "{" ("case" (expression | "_") "=>" expression ";")* "}"
 *   expression := sum (("==" | "<") sum)*
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
  while (true) {
    const op = peekOperator(text, cursor);
    if (op === "") {
      return ok(value);
    }
    const opOffset = cursor.pos;
    cursor.pos += op.length;
    const right = parseSum(text, cursor);
    if (!right.ok) {
      return right;
    }
    if (op === "==") {
      const equal = valuesEqual(value, right.value, opOffset);
      if (!equal.ok) {
        return equal;
      }
      value = equal.value;
    } else {
      if (typeof value !== "number" || typeof right.value !== "number") {
        return err({ offset: opOffset, expected: `a number on each side of "<"` });
      }
      value = value < right.value;
    }
  }
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
  const next = peek(text, cursor);
  if (next === "{") {
    return parseBlock(text, cursor);
  }
  if (next === "(") {
    return parseParenthesized(text, cursor);
  }
  if (next === "&") {
    return parseReference(text, cursor);
  }
  if (next === "*") {
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
    if (name === "match") {
      return parseMatch(text, cursor, start);
    }
    const binding = lookup(cursor.scope, name);
    if (binding === undefined) {
      return err({ offset: start, expected: `a variable in scope (no "${name}" is defined)` });
    }
    return ok(binding.value);
  }
  if (!/\d/.test(next)) {
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
  const condition = parseCondition(text, cursor);
  if (!condition.ok) {
    return condition;
  }
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
  if (peekName(text, cursor) === "") {
    return err({ offset: cursor.pos, expected: `a variable name after "&"` });
  }
  const found = findVariable(text, cursor);
  if (!found.ok) {
    return found;
  }
  const { name, start, binding } = found.value;
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
  for (let index = start + 1; index < text.length; index++) {
    const character = text.charAt(index);
    if (character === "(" || character === "{") {
      depth++;
    } else if (character === ")" || character === "}") {
      if (depth === 0) {
        return false;
      }
      depth--;
    } else if (depth === 0 && character === ";") {
      return false;
    } else if (depth === 0 && character === "=") {
      return text.charAt(index + 1) !== "=";
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
  const { target: referenced } = ref;
  if (!cursor.dead) {
    referenced.value = init.value;
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
  const { target: referencedVariable } = inner.value;
  return ok(referencedVariable.value);
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
  if (typeof value !== "object") {
    return false;
  }
  const { target } = value;
  return target.depth > depth;
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
  const problem = parseStatements(text, cursor);
  if (problem !== undefined) {
    return err(problem);
  }
  return parseExpression(text, cursor);
}

/**
 * Parses the statements at the current position: declarations, assignments, and blocks
 * that have no final expression.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the statements.
 * @returns The first problem found, or undefined if all statements parsed.
 */
function parseStatements(text: string, cursor: Cursor): Problem | undefined {
  while (true) {
    const step = parseOneStatement(text, cursor, true);
    if (!step.matched) {
      return undefined;
    }
    if (step.problem !== undefined) {
      return step.problem;
    }
  }
}

const NOT_A_STATEMENT: StatementStep = { matched: false };

/**
 * Parses one statement at the cursor if one starts there.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the statement if one was parsed.
 * @param allowDeclaration - Whether a "let" declaration is accepted here.
 * @returns The statement step; NOT_A_STATEMENT if no statement starts at the cursor.
 */
function parseOneStatement(text: string, cursor: Cursor, allowDeclaration: boolean): StatementStep {
  const name = peekName(text, cursor);
  if (name === "let" && allowDeclaration) {
    return { matched: true, problem: parseDeclaration(text, cursor) };
  }
  if (name !== "" && peekAfterName(text, cursor, name) === "=") {
    return { matched: true, problem: parseAssignment(text, cursor) };
  }
  if (name !== "" && peekCompoundOperator(text, cursor, name) !== "") {
    return { matched: true, problem: parseCompoundAssignment(text, cursor) };
  }
  if (name === "" && isDereferenceAssignment(text, peekStart(text, cursor))) {
    return { matched: true, problem: parseDereferenceAssignment(text, cursor) };
  }
  if (name === "" && isStatementBlock(text, cursor)) {
    return { matched: true, problem: parseStatementBlock(text, cursor) };
  }
  if (name === "if" && isStatementIf(text, cursor)) {
    return { matched: true, problem: parseStatementIf(text, cursor) };
  }
  if (name === "while") {
    return { matched: true, problem: parseWhile(text, cursor) };
  }
  return NOT_A_STATEMENT;
}

/**
 * Advances past one statement used as a branch of an "if" statement, in a dry run.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the branch when it matches.
 * @returns True if a statement other than a declaration parsed without problems.
 */
function skipStatementBranch(text: string, cursor: Cursor): boolean {
  const step = parseOneStatement(text, cursor, false);
  return step.matched && step.problem === undefined;
}

/**
 * Parses one statement used as a branch of an "if" statement.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the branch.
 * @returns The first problem found, or undefined if the branch parsed.
 */
function parseBranchStatement(text: string, cursor: Cursor): Problem | undefined {
  const step = parseOneStatement(text, cursor, false);
  if (!step.matched) {
    return { offset: cursor.pos, expected: "a statement" };
  }
  return step.problem;
}

/**
 * Decides whether the block at the cursor is a statement: it must parse as statements
 * with no final expression. The check is a dry run with assignments suppressed, and the
 * cursor and scope are restored afterwards, so nothing takes effect.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, which is left unchanged.
 * @returns True if the next significant character opens a block with no final expression.
 */
function isStatementBlock(text: string, cursor: Cursor): boolean {
  if (peek(text, cursor) !== "{") {
    return false;
  }
  const start = cursor.pos;
  const savedDead = cursor.dead;
  const savedScope = cursor.scope;
  cursor.dead = true;
  cursor.pos++;
  cursor.scope = { vars: new Map(), parent: savedScope, depth: savedScope.depth + 1 };
  const problem = parseStatements(text, cursor);
  const isStatement = problem === undefined && peek(text, cursor) === "}";
  cursor.pos = start;
  cursor.dead = savedDead;
  cursor.scope = savedScope;
  return isStatement;
}

/**
 * Decides whether the "if" at the cursor is a statement: each branch is a single statement
 * (other than a declaration), and the else branch may be omitted. Like isStatementBlock, this is a dry run
 * that leaves the cursor, dead flag and scope unchanged.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, which is left unchanged.
 * @returns True if the "if" at the cursor is a statement.
 */
function isStatementIf(text: string, cursor: Cursor): boolean {
  if (peekName(text, cursor) !== "if") {
    return false;
  }
  const start = cursor.pos;
  const savedDead = cursor.dead;
  const savedScope = cursor.scope;
  cursor.dead = true;
  const isStatement = dryRunStatementIf(text, cursor);
  cursor.pos = start;
  cursor.dead = savedDead;
  cursor.scope = savedScope;
  return isStatement;
}

/**
 * Advances through an "if" statement shape without effects, reporting whether it matches.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced as the shape is matched.
 * @returns True if the text matches "if (condition) { ... }" optionally followed by "else { ... }".
 */
function dryRunStatementIf(text: string, cursor: Cursor): boolean {
  cursor.pos += "if".length;
  if (peek(text, cursor) !== "(") {
    return false;
  }
  cursor.pos++;
  const condition = parseExpression(text, cursor);
  if (!condition.ok || typeof condition.value !== "boolean") {
    return false;
  }
  if (peek(text, cursor) !== ")") {
    return false;
  }
  cursor.pos++;
  if (!skipStatementBranch(text, cursor)) {
    return false;
  }
  if (peekName(text, cursor) !== "else") {
    return true;
  }
  cursor.pos += "else".length;
  return skipStatementBranch(text, cursor);
}

/**
 * Maximum number of times a while loop may run. A loop that would run longer is reported as an
 * error rather than hanging.
 */
const MAX_LOOP_ITERATIONS = 10000;

/**
 * Parses "while (condition) statement". Each iteration re-parses the condition and the body
 * from the same text, so assignments in the body are seen by the next check. The final check
 * is false, and its body is parsed with effects suppressed.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the loop.
 * @returns The first problem found, or undefined if the loop parsed.
 */
function parseWhile(text: string, cursor: Cursor): Problem | undefined {
  cursor.pos += "while".length;
  peek(text, cursor);
  const headStart = cursor.pos;
  const outerDead = cursor.dead;
  let iterations = 0;
  while (true) {
    cursor.pos = headStart;
    const condition = parseCondition(text, cursor);
    if (!condition.ok) {
      return condition.error;
    }
    const runBody = condition.value && !outerDead;
    cursor.dead = outerDead || !runBody;
    const problem = parseBranchStatement(text, cursor);
    cursor.dead = outerDead;
    if (problem !== undefined) {
      return problem;
    }
    if (!runBody) {
      return undefined;
    }
    iterations++;
    if (iterations >= MAX_LOOP_ITERATIONS) {
      return { offset: headStart, expected: `a loop that ends within ${MAX_LOOP_ITERATIONS} iterations` };
    }
  }
}

/**
 * Parses an "if" statement. Only the branch taken runs; the other is checked and skipped.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the statement.
 * @returns The first problem found, or undefined if the statement parsed.
 */
function parseStatementIf(text: string, cursor: Cursor): Problem | undefined {
  cursor.pos += "if".length;
  const condition = parseCondition(text, cursor);
  if (!condition.ok) {
    return condition.error;
  }
  const outerDead = cursor.dead;
  cursor.dead = outerDead || !condition.value;
  const thenProblem = parseBranchStatement(text, cursor);
  cursor.dead = outerDead;
  if (thenProblem !== undefined) {
    return thenProblem;
  }
  if (peekName(text, cursor) !== "else") {
    return undefined;
  }
  cursor.pos += "else".length;
  cursor.dead = outerDead || condition.value;
  const elseProblem = parseBranchStatement(text, cursor);
  cursor.dead = outerDead;
  return elseProblem;
}

/**
 * Parses a block used as a statement, running its statements in a new scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the block.
 * @returns The first problem found, or undefined if the block parsed.
 */
function parseStatementBlock(text: string, cursor: Cursor): Problem | undefined {
  peek(text, cursor);
  cursor.pos++;
  const outer = cursor.scope;
  cursor.scope = { vars: new Map(), parent: outer, depth: outer.depth + 1 };
  const problem = parseStatements(text, cursor);
  cursor.scope = outer;
  if (problem !== undefined) {
    return problem;
  }
  if (peek(text, cursor) !== "}") {
    return { offset: cursor.pos, expected: `"}"` };
  }
  cursor.pos++;
  return undefined;
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
  const { depth } = cursor.scope;
  const init = parseInitializer(text, cursor, (value, offset) =>
    escapes(value, depth) ? { offset, expected: OUTLIVES_MESSAGE } : undefined,
  );
  if (!init.ok) {
    return init.error;
  }
  const { vars } = cursor.scope;
  vars.set(name, { value: init.value, mutable, depth });
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
  const target = findMutableTarget(text, cursor);
  if (!target.ok) {
    return target.error;
  }
  const { name, binding } = target.value;
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
 * Reads the variable name at the cursor and finds it in scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the variable name.
 * @returns An Ok result with the variable, or an Err result with the first problem found.
 */
function findVariable(text: string, cursor: Cursor): Result<NamedVariable, Problem> {
  const name = peekName(text, cursor);
  const start = cursor.pos;
  cursor.pos += name.length;
  const binding = lookup(cursor.scope, name);
  if (binding === undefined) {
    return err({ offset: start, expected: `a variable in scope (no "${name}" is defined)` });
  }
  return ok({ name, start, binding });
}

/**
 * Reads the variable being assigned to, and checks that it is in scope and declared with "let mut".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the variable name.
 * @returns An Ok result with the target, or an Err result with the first problem found.
 */
function findMutableTarget(text: string, cursor: Cursor): Result<NamedVariable, Problem> {
  const found = findVariable(text, cursor);
  if (!found.ok) {
    return found;
  }
  const { name, start, binding } = found.value;
  if (!binding.mutable) {
    return err({ offset: start, expected: `a mutable variable (declare "${name}" with "let mut")` });
  }
  return found;
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
function peekCompoundOperator(text: string, cursor: Cursor, name: string): string {
  const saved = cursor.pos;
  cursor.pos += name.length;
  const op = peek(text, cursor);
  const isCompound = (op === "+" || op === "-" || op === "*") && text.charAt(cursor.pos + 1) === "=";
  cursor.pos = saved;
  return isCompound ? op : "";
}

/**
 * Applies a compound-assignment operator to two numbers.
 *
 * @param op - The operator: "+", "-" or "*".
 * @param left - The variable's current value.
 * @param right - The value of the right-hand side.
 * @returns The result to store back in the variable.
 */
function applyCompound(op: string, left: number, right: number): number {
  if (op === "+") {
    return left + right;
  }
  if (op === "-") {
    return left - right;
  }
  return left * right;
}

/**
 * Parses a compound assignment such as "x += expression;" to a mutable numeric variable.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the assignment.
 * @returns The first problem found, or undefined if the assignment parsed.
 */
function parseCompoundAssignment(text: string, cursor: Cursor): Problem | undefined {
  const target = findMutableTarget(text, cursor);
  if (!target.ok) {
    return target.error;
  }
  const { name, start, binding } = target.value;
  if (typeof binding.value !== "number") {
    return { offset: start, expected: `a number variable for a compound assignment to "${name}"` };
  }
  peek(text, cursor);
  const op = text.charAt(cursor.pos);
  cursor.pos++;
  const init = parseInitializer(text, cursor, (value, offset) =>
    typeof value === "number" ? undefined : { offset, expected: `a number for "${op}=" on "${name}"` },
  );
  if (!init.ok) {
    return init.error;
  }
  const current = binding.value;
  const rhs = init.value;
  if (typeof current === "number" && typeof rhs === "number" && !cursor.dead) {
    binding.value = applyCompound(op, current, rhs);
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
 * Returns the comparison operator at the next significant position, without consuming it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past any whitespace.
 * @returns "==" or "<" if one is next, otherwise "".
 */
function peekOperator(text: string, cursor: Cursor): string {
  skipSpaces(text, cursor);
  if (text.slice(cursor.pos, cursor.pos + 2) === "==") {
    return "==";
  }
  return text.charAt(cursor.pos) === "<" ? "<" : "";
}

/**
 * Compares two values with "==". They must have the same type. References are compared by the
 * values they point to, which must also have the same type.
 *
 * @param left - The left-hand value.
 * @param right - The right-hand value.
 * @param offset - Offset of the operator, for error reporting.
 * @returns An Ok result with whether the values are equal, or an Err result with the first problem found.
 */
function valuesEqual(left: Value, right: Value, offset: number): Result<boolean, Problem> {
  if (typeof left !== typeof right) {
    return err({ offset, expected: `a value of the same type as the left side of "=="` });
  }
  if (typeof left === "object" && typeof right === "object") {
    const { target: leftTarget } = left;
    const { target: rightTarget } = right;
    const leftPointee = leftTarget.value;
    const rightPointee = rightTarget.value;
    if (typeof leftPointee !== typeof rightPointee) {
      return err({ offset, expected: `references to values of the same type on each side of "=="` });
    }
    return ok(leftPointee === rightPointee);
  }
  return ok(left === right);
}

/**
 * Parses a case pattern, which is either "_" (matches anything) or an expression compared with the scrutinee.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the pattern.
 * @param scrutinee - The value being matched.
 * @param dead - True if the pattern's effects must not run.
 * @returns An Ok result with whether the pattern matches, or an Err result with the first problem found.
 */
function parsePattern(text: string, cursor: Cursor, scrutinee: Value, dead: boolean): Result<boolean, Problem> {
  if (peekName(text, cursor) === "_") {
    cursor.pos += "_".length;
    return ok(true);
  }
  peek(text, cursor);
  const patternStart = cursor.pos;
  const outerDead = cursor.dead;
  cursor.dead = dead;
  const pattern = parseExpression(text, cursor);
  cursor.dead = outerDead;
  if (!pattern.ok) {
    return pattern;
  }
  return valuesEqual(scrutinee, pattern.value, patternStart);
}

/**
 * Parses "match (scrutinee) { case pattern => value; ... }". Arms are tried in order and the
 * first whose pattern equals the scrutinee gives the value. Only the chosen arm's effects run.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the match.
 * @param start - Offset of the "match" keyword, for error reporting.
 * @returns An Ok result with the chosen arm's value, or an Err result with the first problem found.
 */
function parseMatch(text: string, cursor: Cursor, start: number): Result<Value, Problem> {
  const scrutinee = parseParenthesized(text, cursor);
  if (!scrutinee.ok) {
    return scrutinee;
  }
  if (peek(text, cursor) !== "{") {
    return err({ offset: cursor.pos, expected: `"{"` });
  }
  cursor.pos++;
  const outerDead = cursor.dead;
  let result: Value | undefined;
  while (peekName(text, cursor) === "case") {
    cursor.pos += "case".length;
    const chosen = result !== undefined;
    const patternMatch = parsePattern(text, cursor, scrutinee.value, outerDead || chosen);
    if (!patternMatch.ok) {
      return patternMatch;
    }
    if (peek(text, cursor) !== "=" || text.charAt(cursor.pos + 1) !== ">") {
      return err({ offset: cursor.pos, expected: `"=>"` });
    }
    cursor.pos += 2;
    const matches = patternMatch.value && !chosen;
    cursor.dead = outerDead || !matches;
    const body = parseExpression(text, cursor);
    cursor.dead = outerDead;
    if (!body.ok) {
      return body;
    }
    if (peek(text, cursor) !== ";") {
      return err({ offset: cursor.pos, expected: `";"` });
    }
    cursor.pos++;
    if (matches) {
      result = body.value;
    }
  }
  if (peek(text, cursor) !== "}") {
    return err({ offset: cursor.pos, expected: `"case" or "}"` });
  }
  cursor.pos++;
  if (result === undefined) {
    return err({ offset: start, expected: `a case whose pattern equals the matched value` });
  }
  return ok(result);
}

/**
 * Parses a parenthesized expression, "(expression)".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the expression.
 * @returns An Ok result with the expression's value, or an Err result with the first problem found.
 */
function parseParenthesized(text: string, cursor: Cursor): Result<Value, Problem> {
  if (peek(text, cursor) !== "(") {
    return err({ offset: cursor.pos, expected: `"("` });
  }
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

/**
 * Parses a parenthesized condition, "(expression)", which must be a boolean.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the condition.
 * @returns An Ok result with the condition's value, or an Err result with the first problem found.
 */
function parseCondition(text: string, cursor: Cursor): Result<boolean, Problem> {
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
  return ok(condition.value);
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
function lookup(scope: Scope, name: string): Binding | undefined {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    const { vars } = current;
    const binding = vars.get(name);
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
function locate(text: string, offset: number): Location {
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
