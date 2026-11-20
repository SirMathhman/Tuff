import { err, ok, type Result } from "./src/result";
import {
  describeUnsupported,
  peek,
  peekName,
  peekStart,
  peekOperator,
  peekAfterName,
  peekCompoundOperator,
  skipSpaces,
  type Problem,
  findTopLevel,
} from "./src/lexing";
import {
  type Value,
  type FunctionDef,
  type Cursor,
  type NamedVariable,
  type Param,
  type StatementStep,
} from "./src/types";
import {
  lookup,
  lookupFunction,
  newScope,
  findFunctionBodyEnd,
  escapes,
  isSuppressed,
  takeExit,
  fitsIntegerType,
  checkStore,
  checkDeclaration,
  checkArgument,
  applyCompound,
  valuesEqual,
  OUTLIVES_MESSAGE,
} from "./src/scope";
import { parseNumberSuffix, parseTypeAlias, parseTypeAnnotation } from "./src/annotations";

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
  "for",
  "loop",
  "break",
  "fn",
  "type",
]);

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
 *               | "for" "(" "let" ["mut"] name "=" expression ";" expression ";" statement ")" statement
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
  const cursor: Cursor = {
    pos: 0,
    scope: newScope(undefined),
    dead: false,
    breakable: false,
    callDepth: 0,
  };
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
    if (name === "loop") {
      return parseLoop(text, cursor, start);
    }
    if (peek(text, cursor) === "(") {
      const fn = lookupFunction(cursor.scope, name);
      if (fn === undefined) {
        return err({ offset: start, expected: `a function in scope (no "${name}" is defined)` });
      }
      return parseCall(text, cursor, name, start, fn);
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
  const digits = text.slice(start, cursor.pos);
  return parseNumberSuffix(text, cursor, digits, start);
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
  cursor.scope = newScope(outer);
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
  const end = findTopLevel(
    text,
    start + 1,
    (character, position) =>
      character === ";" ||
      (character === "=" && text.charAt(position + 1) !== "=" && text.charAt(position - 1) !== "="),
  );
  return end >= 0 && text.charAt(end) === "=";
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
  if (!isSuppressed(cursor)) {
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
  if (name === "type" && allowDeclaration) {
    return { matched: true, problem: parseTypeAlias(text, cursor, RESERVED_WORDS) };
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
    return { matched: true, problem: inBreakContext(cursor, false, () => parseWhile(text, cursor)) };
  }
  if (name === "for") {
    return { matched: true, problem: inBreakContext(cursor, false, () => parseFor(text, cursor)) };
  }
  if (name === "break") {
    return { matched: true, problem: parseBreak(text, cursor) };
  }
  if (name === "fn" && allowDeclaration) {
    return { matched: true, problem: parseFunctionDeclaration(text, cursor) };
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
  cursor.scope = newScope(savedScope);
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
 * Parses "for (let init; condition; step) body". The initializer runs once in a new scope. Each
 * iteration checks the condition, runs the body, then runs the step. The step is textually before
 * the body, so each iteration skips past it in a dry run to find where the body starts.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the loop.
 * @returns The first problem found, or undefined if the loop parsed.
 */
function parseFor(text: string, cursor: Cursor): Problem | undefined {
  cursor.pos += "for".length;
  if (peek(text, cursor) !== "(") {
    return { offset: cursor.pos, expected: `"("` };
  }
  cursor.pos++;
  const outerScope = cursor.scope;
  const outerDead = cursor.dead;
  cursor.scope = newScope(outerScope);
  const problem = parseForParts(text, cursor, outerDead);
  cursor.scope = outerScope;
  cursor.dead = outerDead;
  return problem;
}

/**
 * Parses the parts of a "for" loop after the opening parenthesis, in the loop's own scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the loop.
 * @param outerDead - Whether the loop itself is inside a branch that is not taken.
 * @returns The first problem found, or undefined if the loop parsed.
 */
function parseForParts(text: string, cursor: Cursor, outerDead: boolean): Problem | undefined {
  if (peekName(text, cursor) !== "let") {
    return { offset: cursor.pos, expected: "a let declaration" };
  }
  const initProblem = parseDeclaration(text, cursor);
  if (initProblem !== undefined) {
    return initProblem;
  }
  peek(text, cursor);
  const conditionStart = cursor.pos;
  let iterations = 0;
  while (true) {
    cursor.pos = conditionStart;
    const condition = parseExpression(text, cursor);
    if (!condition.ok) {
      return condition.error;
    }
    if (typeof condition.value !== "boolean") {
      return { offset: conditionStart, expected: "a boolean condition" };
    }
    if (peek(text, cursor) !== ";") {
      return { offset: cursor.pos, expected: `";"` };
    }
    cursor.pos++;
    peek(text, cursor);
    const stepStart = cursor.pos;
    const runBody = condition.value && !outerDead;
    cursor.dead = true;
    const stepSkip = parseOneStatement(text, cursor, false);
    cursor.dead = outerDead;
    if (!stepSkip.matched) {
      return { offset: stepStart, expected: "a step statement" };
    }
    if (stepSkip.problem !== undefined) {
      return stepSkip.problem;
    }
    if (peek(text, cursor) !== ")") {
      return { offset: cursor.pos, expected: `")"` };
    }
    cursor.pos++;
    cursor.dead = outerDead || !runBody;
    const bodyProblem = parseBranchStatement(text, cursor);
    cursor.dead = outerDead;
    if (bodyProblem !== undefined) {
      return bodyProblem;
    }
    if (!runBody) {
      return undefined;
    }
    const bodyEnd = cursor.pos;
    cursor.pos = stepStart;
    const step = parseOneStatement(text, cursor, false);
    if (!step.matched) {
      return { offset: stepStart, expected: "a step statement" };
    }
    if (step.problem !== undefined) {
      return step.problem;
    }
    cursor.pos = bodyEnd;
    iterations++;
    if (iterations >= MAX_LOOP_ITERATIONS) {
      return { offset: conditionStart, expected: `a loop that ends within ${MAX_LOOP_ITERATIONS} iterations` };
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
  cursor.scope = newScope(outer);
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
  let type: string | undefined;
  if (peek(text, cursor) === ":") {
    cursor.pos++;
    const annotation = parseTypeAnnotation(text, cursor);
    if (!annotation.ok) {
      return annotation.error;
    }
    type = annotation.value;
  }
  const { depth } = cursor.scope;
  const init = parseInitializer(text, cursor, (value, offset) => checkDeclaration(value, offset, depth, type));
  if (!init.ok) {
    return init.error;
  }
  const { vars } = cursor.scope;
  vars.set(name, { value: init.value, mutable, depth, type });
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
  if (!isSuppressed(cursor)) {
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
  if (typeof current === "number" && typeof rhs === "number" && !isSuppressed(cursor)) {
    const result = applyCompound(op, current, rhs);
    if (binding.type !== undefined && !fitsIntegerType(BigInt(result), binding.type)) {
      return { offset: start, expected: `a value that fits in ${binding.type}` };
    }
    binding.value = result;
  }
  return undefined;
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
 * Runs a parse with "break" allowed or disallowed, restoring the previous setting afterwards.
 *
 * @param cursor - The parse state, whose breakable flag is changed for the duration.
 * @param breakable - Whether "break" is allowed inside the parse.
 * @param parse - The parse to run.
 * @returns The result of the parse.
 */
function inBreakContext<T>(cursor: Cursor, breakable: boolean, parse: () => T): T {
  const outerBreakable = cursor.breakable;
  cursor.breakable = breakable;
  const result = parse();
  cursor.breakable = outerBreakable;
  return result;
}

/**
 * Parses "break value;", which ends the enclosing loop with that value. Statements after it
 * in the loop body take no effect.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the statement.
 * @returns The first problem found, or undefined if the statement parsed.
 */
function parseBreak(text: string, cursor: Cursor): Problem | undefined {
  peek(text, cursor);
  const start = cursor.pos;
  cursor.pos += "break".length;
  if (!cursor.breakable) {
    return { offset: start, expected: "a break inside a loop" };
  }
  const value = parseExpression(text, cursor);
  if (!value.ok) {
    return value.error;
  }
  if (peek(text, cursor) !== ";") {
    return { offset: cursor.pos, expected: `";"` };
  }
  cursor.pos++;
  if (!isSuppressed(cursor)) {
    cursor.exit = { value: value.value };
  }
  return undefined;
}

/**
 * Parses "loop { statements }". The body re-runs until a "break value;" runs, and the loop's
 * value is that value. A break's value may not refer to a variable declared inside the loop.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the loop.
 * @param start - Offset of the "loop" keyword, for error reporting.
 * @returns An Ok result with the break value, or an Err result with the first problem found.
 */
function parseLoop(text: string, cursor: Cursor, start: number): Result<Value, Problem> {
  if (peek(text, cursor) !== "{") {
    return err({ offset: cursor.pos, expected: `"{"` });
  }
  const bodyStart = cursor.pos;
  if (isSuppressed(cursor)) {
    const skipped = inBreakContext(cursor, true, () => parseStatementBlock(text, cursor));
    return skipped === undefined ? ok(0) : err(skipped);
  }
  let iterations = 0;
  while (true) {
    cursor.pos = bodyStart;
    cursor.exit = undefined;
    const problem = inBreakContext(cursor, true, () => parseStatementBlock(text, cursor));
    const exit = takeExit(cursor);
    if (problem !== undefined) {
      return err(problem);
    }
    if (exit !== undefined) {
      const { depth } = cursor.scope;
      if (escapes(exit.value, depth)) {
        return err({ offset: start, expected: OUTLIVES_MESSAGE });
      }
      return ok(exit.value);
    }
    iterations++;
    if (iterations >= MAX_LOOP_ITERATIONS) {
      return err({ offset: start, expected: `a loop that breaks within ${MAX_LOOP_ITERATIONS} iterations` });
    }
  }
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
 * Maximum nesting of function calls, so unbounded recursion is reported as an error.
 */
const MAX_CALL_DEPTH = 100;

/**
 * Parses "fn name(params) => expression;". The body is not evaluated here; it is re-parsed
 * from its text on each call.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the declaration.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
function parseFunctionDeclaration(text: string, cursor: Cursor): Problem | undefined {
  cursor.pos += "fn".length;
  const name = peekName(text, cursor);
  if (name === "" || RESERVED_WORDS.has(name)) {
    return { offset: cursor.pos, expected: "a function name" };
  }
  cursor.pos += name.length;
  if (peek(text, cursor) !== "(") {
    return { offset: cursor.pos, expected: `"("` };
  }
  cursor.pos++;
  const params: Param[] = [];
  while (peek(text, cursor) !== ")") {
    const paramName = peekName(text, cursor);
    if (paramName === "" || RESERVED_WORDS.has(paramName)) {
      return { offset: cursor.pos, expected: `a parameter name or ")"` };
    }
    cursor.pos += paramName.length;
    if (peek(text, cursor) !== ":") {
      return { offset: cursor.pos, expected: `": " and a type for parameter "${paramName}"` };
    }
    cursor.pos++;
    const annotation = parseTypeAnnotation(text, cursor);
    if (!annotation.ok) {
      return annotation.error;
    }
    params.push({ name: paramName, type: annotation.value });
    if (peek(text, cursor) === ",") {
      cursor.pos++;
    } else if (peek(text, cursor) !== ")") {
      return { offset: cursor.pos, expected: `"," or ")"` };
    }
  }
  cursor.pos++;
  let returnType: string | undefined;
  if (peek(text, cursor) === ":") {
    cursor.pos++;
    const annotation = parseTypeAnnotation(text, cursor);
    if (!annotation.ok) {
      return annotation.error;
    }
    returnType = annotation.value;
  }
  if (peek(text, cursor) !== "=" || text.charAt(cursor.pos + 1) !== ">") {
    return { offset: cursor.pos, expected: `"=>"` };
  }
  cursor.pos += 2;
  peek(text, cursor);
  const bodyStart = cursor.pos;
  const bodyEnd = findFunctionBodyEnd(text, bodyStart);
  if (bodyEnd < 0) {
    return { offset: bodyStart, expected: `";" ending the function body` };
  }
  cursor.pos = bodyEnd + 1;
  const { scope } = cursor;
  const { functions } = scope;
  functions.set(name, { params, returnType, bodyStart, bodyEnd, scope });
  return undefined;
}

/**
 * Parses the argument list of a call, evaluates the function body with the arguments bound to
 * its parameters, and returns the body's value. The body is parsed from its text in a new scope
 * whose parent is the scope the function was declared in.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the call.
 * @param name - The function's name, for error reporting.
 * @param start - Offset of the name, for error reporting.
 * @param fn - The function being called.
 * @returns An Ok result with the body's value, or an Err result with the first problem found.
 */
function parseCall(text: string, cursor: Cursor, name: string, start: number, fn: FunctionDef): Result<Value, Problem> {
  peek(text, cursor);
  cursor.pos++;
  const args: Value[] = [];
  while (peek(text, cursor) !== ")") {
    const arg = parseExpression(text, cursor);
    if (!arg.ok) {
      return arg;
    }
    args.push(arg.value);
    if (peek(text, cursor) === ",") {
      cursor.pos++;
    } else if (peek(text, cursor) !== ")") {
      return err({ offset: cursor.pos, expected: `"," or ")"` });
    }
  }
  cursor.pos++;
  const { params, returnType, scope: definingScope } = fn;
  if (args.length !== params.length) {
    return err({ offset: start, expected: `${params.length} argument(s) for "${name}"` });
  }
  const argumentProblem = args
    .map((value, index) => checkArgument(value, start, params[index]))
    .find((problem) => problem !== undefined);
  if (argumentProblem !== undefined) {
    return err(argumentProblem);
  }
  if (cursor.callDepth >= MAX_CALL_DEPTH) {
    return err({ offset: start, expected: `a call nested within ${MAX_CALL_DEPTH} levels` });
  }
  const savedPos = cursor.pos;
  const savedScope = cursor.scope;
  const callScope = newScope(definingScope);
  const { vars } = callScope;
  args.forEach((value, index) => {
    const param = params[index];
    if (param !== undefined) {
      vars.set(param.name, { value, mutable: false, depth: callScope.depth });
    }
  });
  cursor.scope = callScope;
  cursor.pos = fn.bodyStart;
  cursor.callDepth++;
  const body = parseExpression(text, cursor);
  const endsAtSemicolon = peek(text, cursor) === ";";
  cursor.callDepth--;
  cursor.scope = savedScope;
  cursor.pos = savedPos;
  if (!body.ok) {
    return body;
  }
  if (!endsAtSemicolon) {
    return err({ offset: start, expected: `a function body that is a single expression` });
  }
  const resultProblem = checkDeclaration(body.value, start, savedScope.depth, returnType);
  if (resultProblem !== undefined) {
    return err(resultProblem);
  }
  return ok(body.value);
}
