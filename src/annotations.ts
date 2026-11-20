import { peek, peekName, peekStart, type Problem } from "./lexing";
import { isDeclarableType, fitsIntegerType, lookupType } from "./scope";
import { type Cursor } from "./types";
import { err, ok, type Result } from "./result";

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
  const typeName = peekName(text, cursor);
  const resolved = isDeclarableType(typeName) ? typeName : lookupType(cursor.scope, typeName);
  if (resolved === undefined) {
    return err({
      offset: typeStart,
      expected: "an integer type such as U8 or I32, Bool, or a type alias, optionally after &",
    });
  }
  cursor.pos += typeName.length;
  return ok(`${prefix}${resolved}`);
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
  if (name === "" || reserved.has(name) || isDeclarableType(name)) {
    return { offset: nameStart, expected: "a type name" };
  }
  cursor.pos += name.length;
  if (peek(text, cursor) !== "=") {
    return { offset: cursor.pos, expected: `"="` };
  }
  cursor.pos++;
  const annotation = parseTypeAnnotation(text, cursor);
  if (!annotation.ok) {
    return annotation.error;
  }
  if (peek(text, cursor) !== ";") {
    return { offset: cursor.pos, expected: `";"` };
  }
  cursor.pos++;
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
