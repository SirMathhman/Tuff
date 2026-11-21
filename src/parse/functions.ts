import { peek, peekName, type Problem } from "../lexing";
import { parseTypeAndSemicolon, parseTypeAnnotation } from "./annotations";
import { checkTypedValue, findFunctionBodyEnd, lookup, lookupFunction } from "../scope";
import { RESERVED_WORDS } from "../keywords";
import { type Cursor, type FunctionDef, type Param, type Value } from "../types";
import { err, ok, type Result } from "../result";

/** Parses a call's argument list and body, as the call parser in the interpreter does. */
type CallParser = (
  text: string,
  cursor: Cursor,
  name: string,
  start: number,
  fn: FunctionDef,
) => Result<Value, Problem>;
/** The parsed signature of a function declared with "extern fn". */
interface HostSignature {
  /** The function name. */
  readonly name: string;
  /** The parameters. */
  readonly params: readonly Param[];
  /** The declared return type, if any. */
  readonly returnType?: string;
  /** Offset of the "fn" keyword. */
  readonly declStart: number;
}

/**
 * Parses "fn name(params) => expression;". The body is not evaluated here; it is re-parsed
 * from its text on each call.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the declaration.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseFunctionDeclaration(text: string, cursor: Cursor): Problem | undefined {
  const declStart = cursor.pos;
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
  if (peek(text, cursor) === ";") {
    return declareHostFunction(text, cursor, { name, params, returnType, declStart });
  }
  if (peek(text, cursor) !== "=" || text.charAt(cursor.pos + 1) !== ">") {
    return { offset: cursor.pos, expected: `"=>"` };
  }
  cursor.pos += 2;
  peek(text, cursor);
  const bodyStart = cursor.pos;
  const isBlock = text.charAt(bodyStart) === "{";
  const bodyEnd = isBlock ? findBlockEnd(text, bodyStart) : findFunctionBodyEnd(text, bodyStart);
  if (bodyEnd < 0) {
    return { offset: bodyStart, expected: isBlock ? '"}" ending the function body' : '";" ending the function body' };
  }
  cursor.pos = bodyEnd + 1;
  if (isBlock && peek(text, cursor) === ";") {
    cursor.pos++;
  }
  const { scope } = cursor;
  const { functions } = scope;
  functions.set(name, { params, returnType, bodyStart, bodyEnd, scope, external: false });
  return undefined;
}

/**
 * Declares a function whose body the host supplies, written "extern fn name(params) : Type;".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the ";" after the signature, advanced past it.
 * @param signature - The parsed signature and where the declaration starts.
 * @returns The first problem found, or undefined if the declaration is valid.
 */
function declareHostFunction(text: string, cursor: Cursor, signature: HostSignature): Problem | undefined {
  const { name, params, returnType, declStart } = signature;
  if (!precededByExtern(text, declStart)) {
    return { offset: cursor.pos, expected: `"=>" and a body (a function without one is declared with "extern fn")` };
  }
  if (returnType === undefined) {
    return { offset: declStart, expected: `a return type for host function "${name}"` };
  }
  const { hostValues } = cursor;
  if (typeof hostValues.get(name) !== "function") {
    return { offset: declStart, expected: `a host function named "${name}" to be provided` };
  }
  cursor.pos++;
  const { scope } = cursor;
  const { functions } = scope;
  functions.set(name, { params, returnType, bodyStart: -1, bodyEnd: -1, scope, external: true });
  return undefined;
}

/**
 * Reports whether the word "extern" immediately precedes the given offset, ignoring spaces.
 *
 * @param text - The source being parsed.
 * @param declStart - Offset of the declaration keyword.
 * @returns True if "extern" is the word before the declaration.
 */
function precededByExtern(text: string, declStart: number): boolean {
  const before = text.slice(0, declStart).trimEnd();
  const charBefore = before.charAt(before.length - "extern".length - 1);
  return before.endsWith("extern") && !/[A-Za-z0-9_]/.test(charBefore);
}

/**
 * Declares a variable whose value the host supplies, written "extern let name : Type;".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "let", advanced past the declaration.
 * @returns The first problem found, or undefined if the declaration is valid.
 */
export function parseHostVariable(text: string, cursor: Cursor): Problem | undefined {
  const declStart = cursor.pos;
  cursor.pos += "let".length;
  const name = peekName(text, cursor);
  if (name === "" || RESERVED_WORDS.has(name)) {
    return { offset: cursor.pos, expected: "a variable name" };
  }
  cursor.pos += name.length;
  if (peek(text, cursor) !== ":") {
    return { offset: cursor.pos, expected: `":" and a type for "${name}"` };
  }
  cursor.pos++;
  const annotation = parseTypeAndSemicolon(text, cursor);
  if (!annotation.ok) {
    return annotation.error;
  }
  const type = annotation.value;
  const { scope } = cursor;
  const { vars } = scope;
  const sameScope = vars.get(name);
  if (sameScope !== undefined && sameScope.extern === true && sameScope.type !== undefined) {
    return { offset: declStart, expected: `only one extern "${name}" in this scope` };
  }
  const earlier = lookup(scope, name);
  const { hostValues } = cursor;
  const hosted = hostValues.get(name);
  if (earlier !== undefined && earlier.extern !== true) {
    return { offset: declStart, expected: "an earlier extern binding of the same name to type" };
  }
  const value = earlier !== undefined ? earlier.value : hosted;
  if (value === undefined || typeof value === "function") {
    return { offset: declStart, expected: `a value for "${name}" from an earlier binding or the host` };
  }
  const problem = checkTypedValue(value, declStart, type);
  if (problem !== undefined) {
    return problem;
  }
  vars.set(name, { value, mutable: false, depth: scope.depth, type, extern: true });
  return undefined;
}

/**
 * Finds the "}" that closes the block starting at the given offset.
 *
 * @param text - The source being parsed.
 * @param start - Offset of the opening "{".
 * @returns The offset of the matching "}", or -1 if the block is never closed.
 */
function findBlockEnd(text: string, start: number): number {
  let depth = 0;
  for (let pos = start; pos < text.length; pos++) {
    const char = text.charAt(pos);
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return pos;
      }
    }
  }
  return -1;
}

/**
 * Parses the block body of a function that returns Void. Its statements run for their effects; it has no value.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the block, advanced past it.
 * @param parseBlock - Parses a statement block.
 * @returns An Ok result with a placeholder value, or an Err result with the first problem found.
 */
export function parseVoidBody(
  text: string,
  cursor: Cursor,
  parseBlock: (text: string, cursor: Cursor) => Problem | undefined,
): Result<Value, Problem> {
  const problem = parseBlock(text, cursor);
  return problem === undefined ? ok(0) : err(problem);
}

/**
 * Parses a call to a Void function used as a statement, "name(...);", and discards its result.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the function name, advanced past the ";".
 * @param name - The function's name.
 * @param parseCallFn - Parses the call's arguments and body.
 * @returns The first problem found, or undefined if the statement parsed.
 */
export function parseCallStatement(
  text: string,
  cursor: Cursor,
  name: string,
  parseCallFn: CallParser,
): Problem | undefined {
  const start = cursor.pos;
  cursor.pos += name.length;
  const fn = lookupFunction(cursor.scope, name);
  if (fn === undefined) {
    return { offset: start, expected: `a function in scope (no "${name}" is defined)` };
  }
  const call = parseCallFn(text, cursor, name, start, fn);
  if (!call.ok) {
    return call.error;
  }
  if (peek(text, cursor) !== ";") {
    return { offset: cursor.pos, expected: `";"` };
  }
  cursor.pos++;
  return undefined;
}
