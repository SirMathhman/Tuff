import { err, ok, type Result } from "../result";
import { peek, peekName, peekOperator, type Problem } from "../lexing";
import { type Cursor, type FunctionDef, type Value } from "../types";
import {
  lookup,
  lookupFunction,
  newScope,
  escapes,
  isSuppressed,
  takeExit,
  checkDeclaration,
  checkArgument,
  valuesEqual,
  isReference,
  lookupStruct,
  OUTLIVES_MESSAGE,
} from "../scope";
import { parseNumberSuffix, parseTypeAnnotation } from "../parse/annotations";
import { parseTypeArguments } from "../parse/generics";
import { parseExternValue, parseUnboundName, unreadable } from "../parse/imports";
import { callExternal } from "../host";
import { instantiateFunction, parseVoidBody } from "../parse/functions";
import { parseArrayLiteral } from "../parse/arrays";
import { parsePostfix } from "../parse/postfix";
import { parseStructLiteral } from "../parse/structs";
import { findVariable, inBreakContext, MAX_LOOP_ITERATIONS, type Grammar } from "./grammar";

/**
 * Maximum nesting of function calls, so unbounded recursion is reported as an error.
 */
const MAX_CALL_DEPTH = 100;

/**
 * Parses an expression: sums compared with "==" or "<". The comparison yields 1 when
 * the sides are equal and 0 otherwise.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @param grammar - The statement entry points, for blocks inside the expression.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
export function parseExpression(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  const first = parseSum(text, cursor, grammar);
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
    const right = parseSum(text, cursor, grammar);
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
 * @param grammar - The statement entry points.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseSum(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  const first = parseTerm(text, cursor, grammar);
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
    const right = parseTerm(text, cursor, grammar);
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
 * @param grammar - The statement entry points.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
function parseTerm(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  const first = parseFactor(text, cursor, grammar);
  if (!first.ok) {
    return first;
  }
  let value = first.value;
  while (peek(text, cursor) === "*") {
    const opOffset = cursor.pos;
    cursor.pos++;
    const right = parseFactor(text, cursor, grammar);
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
 * Parses a non-negative integer, a variable, a parenthesized expression, a block, or a construct
 * that starts with a keyword such as "if", "match" or "loop".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
export function parseFactor(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  const next = peek(text, cursor);
  if (next === "{") {
    return parseBlock(text, cursor, grammar);
  }
  if (next === "(") {
    return parseParenthesized(text, cursor, grammar);
  }
  if (next === "&") {
    return parseReference(text, cursor);
  }
  if (next === "[") {
    return parseArrayLiteral(text, cursor, (source, position) => parseExpression(source, position, grammar));
  }
  if (next === "*") {
    return parseDereference(text, cursor, grammar);
  }
  const name = peekName(text, cursor);
  if (name !== "") {
    const start = cursor.pos;
    cursor.pos += name.length;
    if (name === "true" || name === "false") {
      return ok(name === "true");
    }
    if (name === "extern") {
      return parseExternValue(text, cursor, start);
    }
    if (name === "if") {
      return parseIf(text, cursor, grammar);
    }
    if (name === "match") {
      return parseMatch(text, cursor, start, grammar);
    }
    if (name === "loop") {
      return parseLoop(text, cursor, start, grammar);
    }
    const structDef = lookupStruct(cursor.scope, name);
    const typeParams = structDef?.typeParams ?? [];
    const following = peek(text, cursor);
    const genericLiteral = following === "<" && typeParams.length > 0 && lookup(cursor.scope, name) === undefined;
    if (structDef !== undefined && (following === "{" || genericLiteral)) {
      return parseStructLiteral(text, cursor, name, start, (source, position) =>
        parseExpression(source, position, grammar),
      );
    }
    const callee = lookupFunction(cursor.scope, name);
    const calleeTypeParams = callee?.typeParams ?? [];
    const shadowed = lookup(cursor.scope, name) !== undefined;
    if (following === "<" && callee !== undefined && calleeTypeParams.length > 0 && !shadowed) {
      return parseValueCall(text, cursor, name, start, callee, grammar);
    }
    if (following === "(") {
      if (callee === undefined) {
        return err({ offset: start, expected: `a function in scope (no "${name}" is defined)` });
      }
      if (calleeTypeParams.length > 0) {
        return err({ offset: start, expected: `type arguments for ${name}, such as ${name}<I32>` });
      }
      return parseValueCall(text, cursor, name, start, callee, grammar);
    }
    const binding = lookup(cursor.scope, name);
    if (binding === undefined) {
      return parseUnboundName(text, cursor, start, name, (source, position) =>
        parseExpression(source, position, grammar),
      );
    }
    const problem = unreadable(binding, start, name);
    if (problem !== undefined) {
      return err(problem);
    }
    return parsePostfix(text, cursor, start, binding.value, (source, position) =>
      parseExpression(source, position, grammar),
    );
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
 * Parses the statements and final expression inside a block or program.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past what was consumed.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the value of the final expression, or an Err result with the first problem found.
 */
export function parseBlockBody(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  const problem = grammar.statements(text, cursor);
  if (problem !== undefined) {
    return err(problem);
  }
  return parseExpression(text, cursor, grammar);
}

/**
 * Parses a block: optional "let" declarations followed by a final expression,
 * all enclosed in braces. The declarations live in a new scope that ends with the block.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the block.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the value of the final expression, or an Err result with the first problem found.
 */
function parseBlock(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  const blockStart = cursor.pos;
  cursor.pos++;
  const outer = cursor.scope;
  cursor.scope = newScope(outer);
  const result = parseBlockBody(text, cursor, grammar);
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
 * @param grammar - The statement entry points.
 * @returns An Ok result with the chosen branch's value, or an Err result with the first problem found.
 */
function parseIf(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  const condition = parseCondition(text, cursor, grammar);
  if (!condition.ok) {
    return condition;
  }
  const outerDead = cursor.dead;
  const thenResult = parseBranch(text, cursor, outerDead || !condition.value, grammar);
  if (!thenResult.ok) {
    return thenResult;
  }
  if (peekName(text, cursor) !== "else") {
    return err({ offset: cursor.pos, expected: `"else"` });
  }
  cursor.pos += "else".length;
  const elseResult = parseBranch(text, cursor, outerDead || condition.value, grammar);
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
 * @param grammar - The statement entry points.
 * @returns An Ok result with the branch's value, or an Err result with the first problem found.
 */
function parseBranch(text: string, cursor: Cursor, dead: boolean, grammar: Grammar): Result<Value, Problem> {
  const outerDead = cursor.dead;
  cursor.dead = dead;
  const result = parseExpression(text, cursor, grammar);
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
 * Parses "*" followed by a factor that must be a reference, and yields the target's value.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the dereference.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the target's value, or an Err result with the first problem found.
 */
function parseDereference(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  const starOffset = cursor.pos;
  cursor.pos++;
  const inner = parseFactor(text, cursor, grammar);
  if (!inner.ok) {
    return inner;
  }
  if (!isReference(inner.value)) {
    return err({ offset: starOffset, expected: `a reference after "*"` });
  }
  const { target: referencedVariable } = inner.value;
  return ok(referencedVariable.value);
}

/**
 * Parses a condition, "(expression)", which must be a boolean.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the condition.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the condition's value, or an Err result with the first problem found.
 */
export function parseCondition(text: string, cursor: Cursor, grammar: Grammar): Result<boolean, Problem> {
  if (peek(text, cursor) !== "(") {
    return err({ offset: cursor.pos, expected: `"("` });
  }
  cursor.pos++;
  peek(text, cursor);
  const conditionStart = cursor.pos;
  const condition = parseExpression(text, cursor, grammar);
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
 * Parses a parenthesized expression, "(expression)".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the expression.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the expression's value, or an Err result with the first problem found.
 */
function parseParenthesized(text: string, cursor: Cursor, grammar: Grammar): Result<Value, Problem> {
  if (peek(text, cursor) !== "(") {
    return err({ offset: cursor.pos, expected: `"("` });
  }
  cursor.pos++;
  const inner = parseExpression(text, cursor, grammar);
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
 * Parses "match (scrutinee) { case pattern => value; ... }". Arms are tried in order and the
 * first whose pattern equals the scrutinee gives the value. Only the chosen arm's effects run.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the match.
 * @param start - Offset of the "match" keyword, for error reporting.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the chosen arm's value, or an Err result with the first problem found.
 */
function parseMatch(text: string, cursor: Cursor, start: number, grammar: Grammar): Result<Value, Problem> {
  const scrutinee = parseParenthesized(text, cursor, grammar);
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
    const patternMatch = parsePattern(text, cursor, scrutinee.value, outerDead || chosen, grammar);
    if (!patternMatch.ok) {
      return patternMatch;
    }
    if (peek(text, cursor) !== "=" || text.charAt(cursor.pos + 1) !== ">") {
      return err({ offset: cursor.pos, expected: `"=>"` });
    }
    cursor.pos += 2;
    const matches = patternMatch.value && !chosen;
    cursor.dead = outerDead || !matches;
    const body = parseExpression(text, cursor, grammar);
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
 * Parses a case pattern, which is either "_" (matches anything) or an expression compared with the scrutinee.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the pattern.
 * @param scrutinee - The value being matched.
 * @param dead - True if the pattern's effects must not run.
 * @param grammar - The statement entry points.
 * @returns An Ok result with whether the pattern matches, or an Err result with the first problem found.
 */
function parsePattern(
  text: string,
  cursor: Cursor,
  scrutinee: Value,
  dead: boolean,
  grammar: Grammar,
): Result<boolean, Problem> {
  if (peekName(text, cursor) === "_") {
    cursor.pos += "_".length;
    return ok(true);
  }
  peek(text, cursor);
  const patternStart = cursor.pos;
  const outerDead = cursor.dead;
  cursor.dead = dead;
  const pattern = parseExpression(text, cursor, grammar);
  cursor.dead = outerDead;
  if (!pattern.ok) {
    return pattern;
  }
  return valuesEqual(scrutinee, pattern.value, patternStart);
}

/**
 * Parses "loop { statements }". The body re-runs until a "break value;" runs, and the loop's
 * value is that value. A break's value may not refer to a variable declared inside the loop.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the loop.
 * @param start - Offset of the "loop" keyword, for error reporting.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the break value, or an Err result with the first problem found.
 */
function parseLoop(text: string, cursor: Cursor, start: number, grammar: Grammar): Result<Value, Problem> {
  if (peek(text, cursor) !== "{") {
    return err({ offset: cursor.pos, expected: `"{"` });
  }
  const bodyStart = cursor.pos;
  if (isSuppressed(cursor)) {
    const skipped = inBreakContext(cursor, true, () => grammar.statementBlock(text, cursor));
    return skipped === undefined ? ok(0) : err(skipped);
  }
  let iterations = 0;
  while (true) {
    cursor.pos = bodyStart;
    cursor.exit = undefined;
    const problem = inBreakContext(cursor, true, () => grammar.statementBlock(text, cursor));
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
 * Parses a call to a function, with type arguments first if the function is generic. Used for calls
 * whose value is discarded, so a Void function is allowed.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position after the name, at "<" or "(".
 * @param name - The function's name, for error reporting.
 * @param start - Offset of the name, for error reporting.
 * @param fn - The function being called.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the call's value, or an Err result with the first problem found.
 */
export function parseFunctionCall(
  text: string,
  cursor: Cursor,
  name: string,
  start: number,
  fn: FunctionDef,
  grammar: Grammar,
): Result<Value, Problem> {
  const { typeParams } = fn;
  if (typeParams.length === 0) {
    return parseCall(text, cursor, name, start, fn, grammar);
  }
  const args = parseTypeArguments(text, cursor, name, typeParams.length, parseTypeAnnotation);
  if (!args.ok) {
    return err(args.error);
  }
  if (peek(text, cursor) !== "(") {
    return err({ offset: cursor.pos, expected: `"("` });
  }
  return parseCall(text, cursor, name, start, instantiateFunction(fn, args.value), grammar);
}

/**
 * Parses the call of a function that returns a value, which may not be a Void function.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "(", advanced past the call.
 * @param name - The function's name, for error reporting.
 * @param start - Offset of the name, for error reporting.
 * @param fn - The function being called, with any type arguments already applied.
 * @param grammar - The statement entry points.
 * @returns An Ok result with the call's value, or an Err result with the first problem found.
 */
function parseValueCall(
  text: string,
  cursor: Cursor,
  name: string,
  start: number,
  fn: FunctionDef,
  grammar: Grammar,
): Result<Value, Problem> {
  if (fn.returnType === "Void") {
    return err({ offset: start, expected: "a value (a Void function has none; call it as a statement)" });
  }
  return parseFunctionCall(text, cursor, name, start, fn, grammar);
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
 * @param grammar - The statement entry points.
 * @returns An Ok result with the body's value, or an Err result with the first problem found.
 */
export function parseCall(
  text: string,
  cursor: Cursor,
  name: string,
  start: number,
  fn: FunctionDef,
  grammar: Grammar,
): Result<Value, Problem> {
  peek(text, cursor);
  cursor.pos++;
  const args: Value[] = [];
  while (peek(text, cursor) !== ")") {
    const arg = parseExpression(text, cursor, grammar);
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
  if (fn.external) {
    return callExternal(cursor, name, start, args, fn);
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
  const bodyText = fn.source ?? text;
  cursor.pos = fn.bodyStart;
  cursor.callDepth++;
  const body =
    fn.returnType === "Void"
      ? parseVoidBody(bodyText, cursor, grammar.statementBlock)
      : parseExpression(bodyText, cursor, grammar);
  const endsAtSemicolon = peek(bodyText, cursor) === ";";
  cursor.callDepth--;
  cursor.scope = savedScope;
  cursor.pos = savedPos;
  if (!body.ok) {
    return body;
  }
  if (!endsAtSemicolon && bodyText.charAt(fn.bodyStart) !== "{") {
    return err({ offset: start, expected: `a function body that is a single expression` });
  }
  const resultProblem =
    returnType === "Void" ? undefined : checkDeclaration(body.value, start, savedScope.depth, returnType);
  if (resultProblem !== undefined) {
    return err(resultProblem);
  }
  return ok(body.value);
}
