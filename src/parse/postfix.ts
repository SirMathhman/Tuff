import { peek, peekName, peekStart, type Problem } from "./lexing";
import { isArray, isStruct } from "../scope";
import { type Cursor, type Value } from "../types";
import { err, ok, type Result } from "../result";

/** Parses one value from the cursor, such as an index expression. */
type ParseValue = (text: string, cursor: Cursor) => Result<Value, Problem>;

/**
 * Parses the "[index]" and ".field" steps that follow a value, in any order, and yields the value they select.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the steps.
 * @param start - Offset of the base value, for error reporting.
 * @param base - The value the steps apply to.
 * @param parseIndex - Parses an index expression.
 * @returns An Ok result with the selected value, or an Err result with the first problem found.
 */
export function parsePostfix(
  text: string,
  cursor: Cursor,
  start: number,
  base: Value,
  parseIndex: ParseValue,
): Result<Value, Problem> {
  let current = base;
  while (peek(text, cursor) === "[" || peek(text, cursor) === ".") {
    const step =
      peek(text, cursor) === "["
        ? parseElement(text, cursor, start, current, parseIndex)
        : parseField(text, cursor, start, current);
    if (!step.ok) {
      return step;
    }
    current = step.value;
  }
  return ok(current);
}

/**
 * Parses "[index]" and yields the element of an array.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "[", advanced past the index.
 * @param start - Offset of the base value, for error reporting.
 * @param base - The array being indexed.
 * @param parseIndex - Parses the index expression.
 * @returns An Ok result with the element, or an Err result with the first problem found.
 */
function parseElement(
  text: string,
  cursor: Cursor,
  start: number,
  base: Value,
  parseIndex: ParseValue,
): Result<Value, Problem> {
  cursor.pos++;
  const index = parseIndex(text, cursor);
  if (!index.ok) {
    return index;
  }
  if (peek(text, cursor) !== "]") {
    return err({ offset: cursor.pos, expected: `"]"` });
  }
  cursor.pos++;
  if (!isArray(base)) {
    return err({ offset: start, expected: `an array before "["` });
  }
  const { elements } = base;
  const position = index.value;
  const element = typeof position === "number" ? elements[position] : undefined;
  if (element === undefined) {
    return err({ offset: start, expected: `an index from 0 to ${elements.length - 1} for this array` });
  }
  return ok(element);
}

/**
 * Parses ".field" and yields the named field of a struct.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at ".", advanced past the field name.
 * @param start - Offset of the base value, for error reporting.
 * @param base - The struct whose field is read.
 * @returns An Ok result with the field's value, or an Err result with the first problem found.
 */
function parseField(text: string, cursor: Cursor, start: number, base: Value): Result<Value, Problem> {
  cursor.pos++;
  const fieldStart = peekStart(text, cursor);
  const field = peekName(text, cursor);
  if (field === "") {
    return err({ offset: fieldStart, expected: `a field name after "."` });
  }
  cursor.pos += field.length;
  if (!isStruct(base)) {
    return err({ offset: start, expected: `a struct before "."` });
  }
  const { structName, fields } = base;
  const value = fields.get(field);
  if (value === undefined) {
    return err({ offset: fieldStart, expected: `a field of ${structName} named "${field}"` });
  }
  return ok(value);
}
