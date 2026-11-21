import { consumeListSeparator, peek, peekName, type Problem } from "../lexing";
import { parseTypeAndSemicolon, parseTypeAnnotation } from "./annotations";
import { bindTypeParams, newTypeScope, parseTypeParameters, substituteTypeParams } from "./generics";
import { checkTypedValue, findFunctionBodyEnd, lookup, lookupFunction } from "../scope";
import { RESERVED_WORDS } from "../keywords";
import { type Binding, type Cursor, type FunctionDef, type Param, type Value } from "../types";
import { err, ok, type Result } from "../result";

/** Parses a call's argument list and body, as the call parser in the interpreter does. */
type CallParser = (
  text: string,
  cursor: Cursor,
  name: string,
  start: number,
  fn: FunctionDef,
) => Result<Value, Problem>;
/** The parsed parameters and return type of a function's signature. */
interface Signature {
  /** The parameters, in order. */
  readonly params: Param[];
  /** The declared return type, if any. */
  readonly returnType?: string;
}
/** The parsed signature of a function declared with "declare fn". */
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
  let typeParams: string[] = [];
  if (peek(text, cursor) === "<") {
    const parsed = parseTypeParameters(text, cursor, RESERVED_WORDS);
    if (!parsed.ok) {
      return parsed.error;
    }
    typeParams = parsed.value;
  }
  const signature = parseSignature(text, cursor, typeParams);
  if (!signature.ok) {
    return signature.error;
  }
  const { params, returnType } = signature.value;
  if (peek(text, cursor) === ";") {
    if (typeParams.length > 0) {
      return {
        offset: declStart,
        expected: "a body for a generic fn (declare fn and expect fn take no type parameters)",
      };
    }
    if (precededByWord(text, declStart, "expect")) {
      return declareExpectFunction(text, cursor, { name, params, returnType, declStart });
    }
    return declareHostFunction(text, cursor, { name, params, returnType, declStart });
  }
  if (precededByWord(text, declStart, "expect")) {
    return { offset: cursor.pos, expected: "';' (an expect fn has no body)" };
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
  functions.set(name, {
    typeParams,
    params,
    returnType,
    bodyStart,
    bodyEnd,
    scope,
    external: false,
    source: text,
  });
  return undefined;
}

/**
 * Parses "(params) : Type", the signature of a function. The function's type parameters are in scope while the
 * signature is parsed, so that its annotations may name them.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "(", advanced past the signature.
 * @param typeParams - The function's type parameter names, in order.
 * @returns An Ok result with the parameters and return type, or an Err result with the first problem found.
 */
function parseSignature(text: string, cursor: Cursor, typeParams: readonly string[]): Result<Signature, Problem> {
  const outer = cursor.scope;
  cursor.scope = newTypeScope(outer, bindTypeParams(typeParams, typeParams));
  const signature = parseParamsAndReturn(text, cursor);
  cursor.scope = outer;
  return signature;
}

/**
 * Parses the parameter list and the optional return type of a function signature.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "(", advanced past the signature.
 * @returns An Ok result with the parameters and return type, or an Err result with the first problem found.
 */
function parseParamsAndReturn(text: string, cursor: Cursor): Result<Signature, Problem> {
  if (peek(text, cursor) !== "(") {
    return err({ offset: cursor.pos, expected: `"("` });
  }
  cursor.pos++;
  const params: Param[] = [];
  while (peek(text, cursor) !== ")") {
    const paramName = peekName(text, cursor);
    if (paramName === "" || RESERVED_WORDS.has(paramName)) {
      return err({ offset: cursor.pos, expected: `a parameter name or ")"` });
    }
    cursor.pos += paramName.length;
    if (peek(text, cursor) !== ":") {
      return err({ offset: cursor.pos, expected: `": " and a type for parameter "${paramName}"` });
    }
    cursor.pos++;
    const annotation = parseTypeAnnotation(text, cursor);
    if (!annotation.ok) {
      return err(annotation.error);
    }
    params.push({ name: paramName, type: annotation.value });
    const separator = consumeListSeparator(text, cursor, ")");
    if (separator !== undefined) {
      return err(separator);
    }
  }
  cursor.pos++;
  let returnType: string | undefined;
  if (peek(text, cursor) === ":") {
    cursor.pos++;
    const annotation = parseTypeAnnotation(text, cursor);
    if (!annotation.ok) {
      return err(annotation.error);
    }
    returnType = annotation.value;
  }
  return ok({ params, returnType });
}

/**
 * Instantiates a generic function with type arguments. Each type parameter is replaced by its argument in the
 * parameter and return types, and it is an alias for that argument in the scope the body is parsed in, so
 * annotations inside the body see the argument. A function that is not generic is returned unchanged.
 *
 * @param fn - The function being called.
 * @param args - The normalized type arguments, in the same order as the function's type parameters.
 * @returns The instantiated function, with no type parameters left.
 */
export function instantiateFunction(fn: FunctionDef, args: readonly string[]): FunctionDef {
  const { typeParams, params, returnType, scope } = fn;
  if (typeParams.length === 0) {
    return fn;
  }
  const bindings = bindTypeParams(typeParams, args);
  return {
    ...fn,
    typeParams: [],
    params: params.map((param) => ({ name: param.name, type: substituteTypeParams(param.type, bindings) })),
    returnType: returnType === undefined ? undefined : substituteTypeParams(returnType, bindings),
    scope: newTypeScope(scope, bindings),
  };
}

/**
 * Declares a function whose body the host supplies, written "declare fn name(params) : Type;".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the ";" after the signature, advanced past it.
 * @param signature - The parsed signature and where the declaration starts.
 * @returns The first problem found, or undefined if the declaration is valid.
 */
function declareHostFunction(text: string, cursor: Cursor, signature: HostSignature): Problem | undefined {
  const { name, params, returnType, declStart } = signature;
  if (!precededByDeclare(text, declStart)) {
    return { offset: cursor.pos, expected: `"=>" and a body (a function without one is declared with "declare fn")` };
  }
  if (returnType === undefined) {
    return { offset: declStart, expected: `a return type for host function "${name}"` };
  }
  const { hostValues, scope } = cursor;
  const earlier = lookup(scope, name);
  const hosted = hostValues.get(name);
  const host = earlier !== undefined && earlier.host !== undefined ? earlier.host : hosted;
  if (typeof host !== "function") {
    return { offset: declStart, expected: `a host function named "${name}" to be provided` };
  }
  cursor.pos++;
  const { functions } = scope;
  functions.set(name, {
    typeParams: [],
    params,
    returnType,
    bodyStart: -1,
    bodyEnd: -1,
    scope,
    external: true,
    host,
  });
  return undefined;
}

/**
 * Reports whether the word "extern" immediately precedes the given offset, ignoring spaces.
 *
 * @param text - The source being parsed.
 * @param declStart - Offset of the declaration keyword.
 * @returns True if "extern" is the word before the declaration.
 */
function precededByDeclare(text: string, declStart: number): boolean {
  const before = text.slice(0, declStart).trimEnd();
  const charBefore = before.charAt(before.length - "declare".length - 1);
  return before.endsWith("declare") && !/[A-Za-z0-9_]/.test(charBefore);
}

/**
 * Declares a variable whose value the host supplies, written "declare let name : Type;".
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
  if (earlier !== undefined && (earlier.extern !== true || earlier.host !== undefined)) {
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
  const binding: Binding = { value, mutable: false, depth: scope.depth, type, extern: true };
  if (earlier !== undefined) {
    const source = earlier;
    Object.defineProperty(binding, "value", { get: () => source.value, enumerable: true });
  }
  vars.set(name, binding);
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

/**
 * Parses "let name : Type;" after the "in" modifier: an input to a module, whose value is passed when the
 * module is instantiated as "module { name : value }". It is also exported when the statement has "out".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "let", advanced past the declaration.
 * @param isOut - True if the statement also has the "out" modifier.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseInputLet(text: string, cursor: Cursor, isOut: boolean): Problem | undefined {
  const declStart = cursor.pos;
  if (peekName(text, cursor) !== "let") {
    return { offset: cursor.pos, expected: '"let" after "in"' };
  }
  cursor.pos += "let".length;
  const name = peekName(text, cursor);
  if (name === "" || RESERVED_WORDS.has(name)) {
    return { offset: cursor.pos, expected: "an input name" };
  }
  cursor.pos += name.length;
  if (peek(text, cursor) !== ":") {
    return { offset: cursor.pos, expected: `":" and a type for input "${name}"` };
  }
  cursor.pos++;
  const annotation = parseTypeAndSemicolon(text, cursor);
  if (!annotation.ok) {
    return annotation.error;
  }
  const { scope } = cursor;
  const { exports: exportedValues } = scope;
  if (scope.depth !== 0 || exportedValues === undefined) {
    return { offset: declStart, expected: '"in" only at the top level of a module' };
  }
  const { inputs, inputsUsed } = cursor;
  const value = inputs.get(name);
  if (value === undefined) {
    return { offset: declStart, expected: `a value passed for input "${name}"` };
  }
  const problem = checkTypedValue(value, declStart, annotation.value);
  if (problem !== undefined) {
    return problem;
  }
  const { vars } = scope;
  vars.set(name, { value, mutable: false, depth: scope.depth, type: annotation.value });
  inputsUsed.add(name);
  if (isOut) {
    exportedValues.set(name, value);
  }
  return undefined;
}

/**
 * Reports whether the word given immediately precedes the offset, ignoring spaces.
 *
 * @param text - The source being parsed.
 * @param pos - Offset of the declaration keyword.
 * @param word - The word to look for.
 * @returns True if the word is the one before the declaration.
 */
function precededByWord(text: string, pos: number, word: string): boolean {
  const before = text.slice(0, pos).trimEnd();
  const charBefore = before.charAt(before.length - word.length - 1);
  return before.endsWith(word) && !/[A-Za-z0-9_]/.test(charBefore);
}

/**
 * Returns the type of the parameter at an index, or undefined if there is none.
 *
 * @param params - The parameters.
 * @param index - The position to read.
 * @returns The parameter's type, or undefined.
 */
function typeAt(params: readonly Param[], index: number): string | undefined {
  const param = params[index];
  return param === undefined ? undefined : param.type;
}

/**
 * Declares an "expect fn" with no body. It takes the matching "actual fn" that the other side of the pair
 * declares, after checking that their signatures agree.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the ";" after the signature, advanced past it.
 * @param signature - The parsed signature and where the declaration starts.
 * @returns The first problem found, or undefined if the declaration is valid.
 */
function declareExpectFunction(text: string, cursor: Cursor, signature: HostSignature): Problem | undefined {
  const { name, params, returnType, declStart } = signature;
  const { linked, scope } = cursor;
  const actual = linked.get(name);
  if (actual === undefined) {
    return { offset: declStart, expected: `an actual fn "${name}" in the other set of this module` };
  }
  cursor.pos++;
  const { params: actualParams, returnType: actualReturn } = actual;
  const sameParams =
    actualParams.length === params.length && params.every((param, index) => typeAt(actualParams, index) === param.type);
  if (!sameParams || actualReturn !== returnType) {
    return { offset: declStart, expected: `an actual fn "${name}" with the same parameters and return type` };
  }
  const { functions } = scope;
  functions.set(name, actual);
  return undefined;
}

/**
 * Parses "expect fn name(params) : Type;", a function the module declares and another set implements.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "expect", advanced past the declaration.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseExpectFn(text: string, cursor: Cursor): Problem | undefined {
  cursor.pos += "expect".length;
  if (peekName(text, cursor) !== "fn") {
    return { offset: cursor.pos, expected: '"fn" after "expect"' };
  }
  return parseFunctionDeclaration(text, cursor);
}

/**
 * Parses "actual fn name(params) : Type => body;", the implementation of an expect fn in another set.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "actual", advanced past the declaration.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseActualFn(text: string, cursor: Cursor): Problem | undefined {
  cursor.pos += "actual".length;
  if (peekName(text, cursor) !== "fn") {
    return { offset: cursor.pos, expected: '"fn" after "actual"' };
  }
  return parseFunctionDeclaration(text, cursor);
}
