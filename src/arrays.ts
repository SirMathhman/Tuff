import { peek, type Problem } from "./lexing";
import { isArray, kindOf } from "./scope";
import { type Cursor, type Value } from "./types";
import { err, ok, type Result } from "./result";

/** Parses one value from the cursor, such as an element or an index. */
type ParseValue = (text: string, cursor: Cursor) => Result<Value, Problem>;

/**
 * Parses "[a, b, ...]", an array literal. Every element must be the same kind of value.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "[", advanced past the literal.
 * @param parseElement - Parses one element.
 * @returns An Ok result with the array, or an Err result with the first problem found.
 */
export function parseArrayLiteral(text: string, cursor: Cursor, parseElement: ParseValue): Result<Value, Problem> {
  const start = cursor.pos;
  cursor.pos++;
  const elements: Value[] = [];
  while (peek(text, cursor) !== "]") {
    const element = parseElement(text, cursor);
    if (!element.ok) {
      return element;
    }
    elements.push(element.value);
    if (peek(text, cursor) === ",") {
      cursor.pos++;
    } else if (peek(text, cursor) !== "]") {
      return err({ offset: cursor.pos, expected: `"," or "]"` });
    }
  }
  cursor.pos++;
  const first = elements[0];
  if (first !== undefined && elements.some((element) => kindOf(element) !== kindOf(first))) {
    return err({ offset: start, expected: `array elements that are all the same kind of value` });
  }
  return ok({ elements });
}

/**
 * Parses one or more "[index]" after a value that must be an array, and yields the element.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the indexes.
 * @param start - Offset of the array's name, for error reporting.
 * @param base - The value being indexed.
 * @param parseIndex - Parses the index expression.
 * @returns An Ok result with the selected element, or an Err result with the first problem found.
 */
export function parseIndexing(
  text: string,
  cursor: Cursor,
  start: number,
  base: Value,
  parseIndex: ParseValue,
): Result<Value, Problem> {
  let current = base;
  while (peek(text, cursor) === "[") {
    cursor.pos++;
    const index = parseIndex(text, cursor);
    if (!index.ok) {
      return index;
    }
    if (peek(text, cursor) !== "]") {
      return err({ offset: cursor.pos, expected: `"]"` });
    }
    cursor.pos++;
    if (!isArray(current)) {
      return err({ offset: start, expected: `an array before "["` });
    }
    const { elements } = current;
    const position = index.value;
    const element = typeof position === "number" ? elements[position] : undefined;
    if (element === undefined) {
      return err({
        offset: start,
        expected: `an index from 0 to ${elements.length - 1} for this array`,
      });
    }
    current = element;
  }
  return ok(current);
}
