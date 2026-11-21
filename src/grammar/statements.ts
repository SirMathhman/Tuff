import { err, type Result } from "../result";
import { peek, peekName, peekStart, peekAfterName, peekCompoundOperator, findTopLevel, type Problem } from "../lexing";
import { type Cursor, type NamedVariable, type StatementStep, type Value } from "../types";
import {
  newScope,
  checkStore,
  checkDeclaration,
  applyCompound,
  fitsIntegerType,
  isSuppressed,
  isReference,
  lookupFunction,
} from "../scope";
import { parseTypeAlias, parseTypeAnnotation } from "../parse/annotations";
import { hoistFunctions } from "../parse/hoisting";
import { parseModifiedStatement } from "../parse/imports";
import { parseDestructuring, parseExternLet } from "../parse/destructure";
import { parseCallStatement, parseFunctionDeclaration, parseActualFn, parseExpectFn } from "../parse/functions";
import { RESERVED_WORDS } from "../keywords";
import { parseStructDeclaration } from "../parse/structs";
import { parseCondition, parseExpression, parseFactor, parseFunctionCall } from "./expression";
import { findVariable, inBreakContext, MAX_LOOP_ITERATIONS, type Grammar } from "./grammar";

/**
 * Reports whether the name at the cursor starts a statement call to a Void function: the name is a Void function,
 * followed by "(", or by "<" when the function is generic.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the name.
 * @param name - The name at the cursor, or "" if there is none.
 * @returns True if a statement call to a Void function starts here.
 */
function isVoidCallAhead(text: string, cursor: Cursor, name: string): boolean {
  if (name === "") {
    return false;
  }
  const callee = lookupFunction(cursor.scope, name);
  if (callee?.returnType !== "Void") {
    return false;
  }
  const { typeParams } = callee;
  const following = peekAfterName(text, cursor, name);
  return typeParams.length > 0 ? following === "<" : following === "(";
}

const NOT_A_STATEMENT: StatementStep = { matched: false };

/**
 * Parses the statements at the current position: declarations, assignments, and blocks
 * that have no final expression.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the statements.
 * @param grammar - The statement entry points, passed on to the expressions inside the statements.
 * @returns The first problem found, or undefined if all statements parsed.
 */
export function parseStatementList(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  hoistFunctions(text, cursor, parseFunctionDeclaration);
  while (true) {
    const step = parseOneStatement(text, cursor, true, grammar);
    if (!step.matched) {
      return undefined;
    }
    if (step.problem !== undefined) {
      return step.problem;
    }
  }
}

/**
 * Parses one statement at the cursor if one starts there.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the statement if one was parsed.
 * @param allowDeclaration - Whether a "let" declaration is accepted here.
 * @param grammar - The statement entry points.
 * @returns The statement step; NOT_A_STATEMENT if no statement starts at the cursor.
 */
function parseOneStatement(text: string, cursor: Cursor, allowDeclaration: boolean, grammar: Grammar): StatementStep {
  const name = peekName(text, cursor);
  if (name === "let" && allowDeclaration) {
    return { matched: true, problem: parseDeclaration(text, cursor, grammar) };
  }
  if (name === "expect" && allowDeclaration) {
    return { matched: true, problem: parseExpectFn(text, cursor) };
  }
  if (name === "actual" && allowDeclaration) {
    return { matched: true, problem: parseActualFn(text, cursor) };
  }
  if (name === "extern" && allowDeclaration) {
    cursor.pos += "extern".length;
    return {
      matched: true,
      problem: parseExternLet(text, cursor, (source, position, check) =>
        parseInitializer(source, position, check, grammar),
      ),
    };
  }
  if ((name === "out" || name === "in" || name === "declare") && allowDeclaration) {
    return {
      matched: true,
      problem: parseModifiedStatement(text, cursor, (source, position) => parseDeclaration(source, position, grammar)),
    };
  }
  if (name === "struct" && allowDeclaration) {
    return { matched: true, problem: parseStructDeclaration(text, cursor, RESERVED_WORDS) };
  }
  if (name === "type" && allowDeclaration) {
    return { matched: true, problem: parseTypeAlias(text, cursor, RESERVED_WORDS) };
  }
  if (isVoidCallAhead(text, cursor, name)) {
    return {
      matched: true,
      problem: parseCallStatement(text, cursor, name, (source, position, callName, start, fn) =>
        parseFunctionCall(source, position, callName, start, fn, grammar),
      ),
    };
  }
  if (name !== "" && peekAfterName(text, cursor, name) === "=") {
    return { matched: true, problem: parseAssignment(text, cursor, grammar) };
  }
  if (name !== "" && peekCompoundOperator(text, cursor, name) !== "") {
    return { matched: true, problem: parseCompoundAssignment(text, cursor, grammar) };
  }
  if (name === "" && isDereferenceAssignment(text, peekStart(text, cursor))) {
    return { matched: true, problem: parseDereferenceAssignment(text, cursor, grammar) };
  }
  if (name === "" && isStatementBlock(text, cursor, grammar)) {
    return { matched: true, problem: parseStatementBlock(text, cursor, grammar) };
  }
  if (name === "if" && isStatementIf(text, cursor, grammar)) {
    return { matched: true, problem: parseStatementIf(text, cursor, grammar) };
  }
  if (name === "while") {
    return { matched: true, problem: inBreakContext(cursor, false, () => parseWhile(text, cursor, grammar)) };
  }
  if (name === "for") {
    return { matched: true, problem: inBreakContext(cursor, false, () => parseFor(text, cursor, grammar)) };
  }
  if (name === "break") {
    return { matched: true, problem: parseBreak(text, cursor, grammar) };
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
 * @param grammar - The statement entry points.
 * @returns True if a statement other than a declaration parsed without problems.
 */
function skipStatementBranch(text: string, cursor: Cursor, grammar: Grammar): boolean {
  const step = parseOneStatement(text, cursor, false, grammar);
  return step.matched && step.problem === undefined;
}

/**
 * Parses one statement used as a branch of an "if" statement.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the branch.
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the branch parsed.
 */
function parseBranchStatement(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  const step = parseOneStatement(text, cursor, false, grammar);
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
 * @param grammar - The statement entry points.
 * @returns True if the next significant character opens a block with no final expression.
 */
function isStatementBlock(text: string, cursor: Cursor, grammar: Grammar): boolean {
  if (peek(text, cursor) !== "{") {
    return false;
  }
  const start = cursor.pos;
  const savedDead = cursor.dead;
  const savedScope = cursor.scope;
  cursor.dead = true;
  cursor.pos++;
  cursor.scope = newScope(savedScope);
  const problem = parseStatementList(text, cursor, grammar);
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
 * @param grammar - The statement entry points.
 * @returns True if the "if" at the cursor is a statement.
 */
function isStatementIf(text: string, cursor: Cursor, grammar: Grammar): boolean {
  if (peekName(text, cursor) !== "if") {
    return false;
  }
  const start = cursor.pos;
  const savedDead = cursor.dead;
  const savedScope = cursor.scope;
  cursor.dead = true;
  const isStatement = dryRunStatementIf(text, cursor, grammar);
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
 * @param grammar - The statement entry points.
 * @returns True if the text matches "if (condition) { ... }" optionally followed by "else { ... }".
 */
function dryRunStatementIf(text: string, cursor: Cursor, grammar: Grammar): boolean {
  cursor.pos += "if".length;
  if (peek(text, cursor) !== "(") {
    return false;
  }
  cursor.pos++;
  const condition = parseExpression(text, cursor, grammar);
  if (!condition.ok || typeof condition.value !== "boolean") {
    return false;
  }
  if (peek(text, cursor) !== ")") {
    return false;
  }
  cursor.pos++;
  if (!skipStatementBranch(text, cursor, grammar)) {
    return false;
  }
  if (peekName(text, cursor) !== "else") {
    return true;
  }
  cursor.pos += "else".length;
  return skipStatementBranch(text, cursor, grammar);
}

/**
 * Parses "while (condition) statement". Each iteration re-parses the condition and the body
 * from the same text, so assignments in the body are seen by the next check. The final check
 * is false, and its body is parsed with effects suppressed.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the loop.
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the loop parsed.
 */
function parseWhile(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  cursor.pos += "while".length;
  peek(text, cursor);
  const headStart = cursor.pos;
  const outerDead = cursor.dead;
  let iterations = 0;
  while (true) {
    cursor.pos = headStart;
    const condition = parseCondition(text, cursor, grammar);
    if (!condition.ok) {
      return condition.error;
    }
    const runBody = condition.value && !outerDead;
    cursor.dead = outerDead || !runBody;
    const problem = parseBranchStatement(text, cursor, grammar);
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
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the loop parsed.
 */
function parseFor(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  cursor.pos += "for".length;
  if (peek(text, cursor) !== "(") {
    return { offset: cursor.pos, expected: `"("` };
  }
  cursor.pos++;
  const outerScope = cursor.scope;
  const outerDead = cursor.dead;
  cursor.scope = newScope(outerScope);
  const problem = parseForParts(text, cursor, outerDead, grammar);
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
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the loop parsed.
 */
function parseForParts(text: string, cursor: Cursor, outerDead: boolean, grammar: Grammar): Problem | undefined {
  if (peekName(text, cursor) !== "let") {
    return { offset: cursor.pos, expected: "a let declaration" };
  }
  const initProblem = parseDeclaration(text, cursor, grammar);
  if (initProblem !== undefined) {
    return initProblem;
  }
  peek(text, cursor);
  const conditionStart = cursor.pos;
  let iterations = 0;
  while (true) {
    cursor.pos = conditionStart;
    const condition = parseExpression(text, cursor, grammar);
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
    const stepSkip = parseOneStatement(text, cursor, false, grammar);
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
    const bodyProblem = parseBranchStatement(text, cursor, grammar);
    cursor.dead = outerDead;
    if (bodyProblem !== undefined) {
      return bodyProblem;
    }
    if (!runBody) {
      return undefined;
    }
    const bodyEnd = cursor.pos;
    cursor.pos = stepStart;
    const step = parseOneStatement(text, cursor, false, grammar);
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
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the statement parsed.
 */
function parseStatementIf(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  cursor.pos += "if".length;
  const condition = parseCondition(text, cursor, grammar);
  if (!condition.ok) {
    return condition.error;
  }
  const outerDead = cursor.dead;
  cursor.dead = outerDead || !condition.value;
  const thenProblem = parseBranchStatement(text, cursor, grammar);
  cursor.dead = outerDead;
  if (thenProblem !== undefined) {
    return thenProblem;
  }
  if (peekName(text, cursor) !== "else") {
    return undefined;
  }
  cursor.pos += "else".length;
  cursor.dead = outerDead || condition.value;
  const elseProblem = parseBranchStatement(text, cursor, grammar);
  cursor.dead = outerDead;
  return elseProblem;
}

/**
 * Parses a block used as a statement, running its statements in a new scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the block.
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the block parsed.
 */
export function parseStatementBlock(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  peek(text, cursor);
  cursor.pos++;
  const outer = cursor.scope;
  cursor.scope = newScope(outer);
  const problem = parseStatementList(text, cursor, grammar);
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
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
function parseDeclaration(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  cursor.pos += "let".length;
  let mutable = false;
  if (peekName(text, cursor) === "mut") {
    cursor.pos += "mut".length;
    mutable = true;
  }
  if (peek(text, cursor) === "{") {
    return parseDestructuring(
      text,
      cursor,
      mutable,
      (source, position, check) => parseInitializer(source, position, check, grammar),
      false,
    );
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
  const init = parseInitializer(text, cursor, (value, offset) => checkDeclaration(value, offset, depth, type), grammar);
  if (!init.ok) {
    return init.error;
  }
  const { vars } = cursor.scope;
  vars.set(name, { value: init.value, mutable, depth, type });
  return undefined;
}

/**
 * Parses "= expression;" after an assignment target, and checks the value before accepting it.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the initializer.
 * @param check - Returns a problem if the value may not be stored, given its offset.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseInitializer(
  text: string,
  cursor: Cursor,
  check: (value: Value, offset: number) => Problem | undefined,
  grammar: Grammar,
): Result<Value, Problem> {
  if (peek(text, cursor) !== "=") {
    return err({ offset: cursor.pos, expected: `"="` });
  }
  cursor.pos++;
  peek(text, cursor);
  const valueStart = cursor.pos;
  const value = parseExpression(text, cursor, grammar);
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
 * Parses an assignment to a variable declared with "let mut".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the assignment.
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the assignment parsed.
 */
function parseAssignment(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  const target = findMutableTarget(text, cursor);
  if (!target.ok) {
    return target.error;
  }
  const { name, binding } = target.value;
  const init = parseInitializer(
    text,
    cursor,
    (value, offset) => checkStore(value, offset, binding, `"${name}"`),
    grammar,
  );
  if (!init.ok) {
    return init.error;
  }
  if (!isSuppressed(cursor)) {
    binding.value = init.value;
  }
  return undefined;
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
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the assignment parsed.
 */
function parseCompoundAssignment(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
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
  const init = parseInitializer(
    text,
    cursor,
    (value, offset) =>
      typeof value === "number" ? undefined : { offset, expected: `a number for "${op}=" on "${name}"` },
    grammar,
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
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the assignment parsed.
 */
function parseDereferenceAssignment(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  peek(text, cursor);
  const starOffset = cursor.pos;
  cursor.pos++;
  const target = parseFactor(text, cursor, grammar);
  if (!target.ok) {
    return target.error;
  }
  const ref = target.value;
  if (!isReference(ref)) {
    return { offset: starOffset, expected: `a reference after "*"` };
  }
  if (!ref.mutable) {
    return { offset: starOffset, expected: `a mutable reference (made with "&mut") to assign through` };
  }
  const init = parseInitializer(
    text,
    cursor,
    (value, offset) => checkStore(value, offset, ref.target, "the referenced variable"),
    grammar,
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
 * Parses "break value;", which ends the enclosing loop with that value. Statements after it
 * in the loop body take no effect.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the statement.
 * @param grammar - The statement entry points.
 * @returns The first problem found, or undefined if the statement parsed.
 */
function parseBreak(text: string, cursor: Cursor, grammar: Grammar): Problem | undefined {
  peek(text, cursor);
  const start = cursor.pos;
  cursor.pos += "break".length;
  if (!cursor.breakable) {
    return { offset: start, expected: "a break inside a loop" };
  }
  const value = parseExpression(text, cursor, grammar);
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
