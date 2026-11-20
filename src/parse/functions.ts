import { peek, peekName, type Problem } from "./lexing";
import { parseTypeAndSemicolon, parseTypeAnnotation } from "./annotations";
import { checkTypedValue, findFunctionBodyEnd } from "../scope";
import { RESERVED_WORDS } from "../keywords";
import { type Cursor, type Param } from "../types";

/** The parsed signature of a function declared with "in fn". */
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
  const bodyEnd = findFunctionBodyEnd(text, bodyStart);
  if (bodyEnd < 0) {
    return { offset: bodyStart, expected: `";" ending the function body` };
  }
  cursor.pos = bodyEnd + 1;
  const { scope } = cursor;
  const { functions } = scope;
  functions.set(name, { params, returnType, bodyStart, bodyEnd, scope, external: false });
  return undefined;
}

/**
 * Declares a function whose body the host supplies, written "in fn name(params) : Type;".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the ";" after the signature, advanced past it.
 * @param signature - The parsed signature and where the declaration starts.
 * @returns The first problem found, or undefined if the declaration is valid.
 */
function declareHostFunction(text: string, cursor: Cursor, signature: HostSignature): Problem | undefined {
  const { name, params, returnType, declStart } = signature;
  if (!precededByIn(text, declStart)) {
    return { offset: cursor.pos, expected: `"=>" and a body (a function without one is declared with "in fn")` };
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
 * Reports whether the word "in" immediately precedes the given offset, ignoring spaces.
 *
 * @param text - The source being parsed.
 * @param declStart - Offset of the declaration keyword.
 * @returns True if "in" is the word before the declaration.
 */
function precededByIn(text: string, declStart: number): boolean {
  const before = text.slice(0, declStart).trimEnd();
  const charBefore = before.charAt(before.length - 3);
  return before.endsWith("in") && !/[A-Za-z0-9_]/.test(charBefore);
}

/**
 * Declares a variable whose value the host supplies, written "in let name : Type;".
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
  const { hostValues } = cursor;
  const value = hostValues.get(name);
  if (value === undefined || typeof value === "function") {
    return { offset: declStart, expected: `a host value named "${name}" to be provided` };
  }
  const type = annotation.value;
  const problem = checkTypedValue(value, declStart, type);
  if (problem !== undefined) {
    return problem;
  }
  const { scope } = cursor;
  const { vars } = scope;
  vars.set(name, { value, mutable: false, depth: scope.depth, type });
  return undefined;
}
