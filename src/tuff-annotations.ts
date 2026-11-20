import { peek, peekName, peekStart, type Problem } from "./tuff-lexing";
import { isDeclarableType, fitsIntegerType } from "./tuff-scope";
import { type Cursor } from "./tuff-types";
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
  if (!isDeclarableType(typeName)) {
    return err({ offset: typeStart, expected: "an integer type such as U8 or I32, or Bool, optionally after &" });
  }
  cursor.pos += typeName.length;
  return ok(`${prefix}${typeName}`);
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
