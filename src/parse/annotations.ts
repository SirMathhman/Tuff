import { peek, peekName, peekStart, type Problem } from "../lexing";
import { isDeclarableType, fitsIntegerType, lookupStruct, lookupType } from "../scope";
import { type Cursor, type Scope } from "../types";
import { err, ok, type Result } from "../result";

/**
 * Finds what a type name stands for. A type alias in scope shadows a built-in type of the same name.
 *
 * @param scope - The scope the annotation appears in.
 * @param name - The type name as written.
 * @returns The type the name stands for, or undefined if the name is neither an alias nor a built-in type.
 */
function resolveTypeName(scope: Scope, name: string): string | undefined {
  const aliased = lookupType(scope, name);
  if (aliased !== undefined) {
    return aliased;
  }
  return isDeclarableType(name) || lookupStruct(scope, name) !== undefined ? name : undefined;
}

/**
 * Parses a type annotation after ":": a type name such as "U8" or "Bool", optionally
 * preceded by "&" or "&mut" to declare a reference to that type.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the type.
 * @returns An Ok result with the normalized type, such as "&mut Bool", or an Err result with the problem found.
 */
export function parseTypeAnnotation(text: string, cursor: Cursor): Result<string, Problem> {
  const typeStart = peekStart(text, cursor);
  let prefix = "";
  while (peek(text, cursor) === "&") {
    cursor.pos++;
    prefix += "&";
    if (peekName(text, cursor) === "mut") {
      cursor.pos += "mut".length;
      prefix += "mut ";
    }
  }
  if (peek(text, cursor) === "[") {
    const array = parseArrayType(text, cursor);
    if (!array.ok) {
      return array;
    }
    return ok(`${prefix}${array.value}`);
  }
  const typeName = peekName(text, cursor);
  const resolved = resolveTypeName(cursor.scope, typeName);
  if (resolved === undefined) {
    return err({
      offset: typeStart,
      expected:
        "an integer type such as U8 or I32, Bool, an array such as [I32; 3], or a type alias, optionally after &",
    });
  }
  cursor.pos += typeName.length;
  return ok(`${prefix}${resolved}`);
}

/**
 * Parses a type annotation followed by ";", and consumes the ";".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the type, advanced past the ";".
 * @returns An Ok result with the normalized type, or an Err result with the problem found.
 */
export function parseTypeAndSemicolon(text: string, cursor: Cursor): Result<string, Problem> {
  const annotation = parseTypeAnnotation(text, cursor);
  if (!annotation.ok) {
    return annotation;
  }
  if (peek(text, cursor) !== ";") {
    return err({ offset: cursor.pos, expected: `";"` });
  }
  cursor.pos++;
  return annotation;
}

/**
 * Parses "[Type; N]", an array type of N elements of Type.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "[", advanced past the array type.
 * @returns An Ok result with the normalized type, such as "[I32;3]", or an Err result with the problem found.
 */
function parseArrayType(text: string, cursor: Cursor): Result<string, Problem> {
  cursor.pos++;
  const element = parseTypeAnnotation(text, cursor);
  if (!element.ok) {
    return element;
  }
  if (peek(text, cursor) !== ";") {
    return err({ offset: cursor.pos, expected: `";" and a length in "[Type; N]"` });
  }
  cursor.pos++;
  peek(text, cursor);
  const digits = /^\d+/.exec(text.slice(cursor.pos));
  if (digits === null) {
    return err({ offset: cursor.pos, expected: `an array length such as 3` });
  }
  const [length = ""] = digits;
  cursor.pos += length.length;
  if (peek(text, cursor) !== "]") {
    return err({ offset: cursor.pos, expected: `"]"` });
  }
  cursor.pos++;
  return ok(`[${element.value};${length}]`);
}

/**
 * Parses "type Name = Type;", which declares Name as another name for Type in the current scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the declaration.
 * @param reserved - Words that cannot be used as a type name.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseTypeAlias(text: string, cursor: Cursor, reserved: ReadonlySet<string>): Problem | undefined {
  cursor.pos += "type".length;
  const nameStart = peekStart(text, cursor);
  const name = peekName(text, cursor);
  if (name === "" || reserved.has(name)) {
    return { offset: nameStart, expected: "a type name" };
  }
  cursor.pos += name.length;
  if (peek(text, cursor) !== "=") {
    return { offset: cursor.pos, expected: `"="` };
  }
  cursor.pos++;
  const annotation = parseTypeAndSemicolon(text, cursor);
  if (!annotation.ok) {
    return annotation.error;
  }
  const { scope } = cursor;
  const { types } = scope;
  types.set(name, annotation.value);
  return undefined;
}

/**
 * Reads an optional integer type suffix ("U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64")
 * after the digits of a literal, and checks that the value fits the type.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the suffix.
 * @param digits - The digits of the literal.
 * @param start - Offset of the literal, for error reporting.
 * @returns An Ok result with the literal's value, or an Err result if it does not fit the suffix's type.
 */
export function parseNumberSuffix(
  text: string,
  cursor: Cursor,
  digits: string,
  start: number,
): Result<number, Problem> {
  const match = /^([UI])(8|16|32|64)(?![A-Za-z0-9_])/.exec(text.slice(cursor.pos));
  if (match === null) {
    return ok(Number(digits));
  }
  const [suffix = ""] = match;
  cursor.pos += suffix.length;
  if (!fitsIntegerType(BigInt(digits), suffix)) {
    return err({ offset: start, expected: `a value that fits in ${suffix}` });
  }
  return ok(Number(digits));
}
