import { peek, peekName, peekStart, type Problem } from "./lexing";
import { parseTypeAnnotation } from "./annotations";
import { checkTypedValue, isDeclarableType, lookupStruct } from "./scope";
import { type Cursor, type Value } from "./types";
import { err, ok, type Result } from "./result";

/** Parses one value from the cursor, such as a field's value. */
type ParseValue = (text: string, cursor: Cursor) => Result<Value, Problem>;

/**
 * Parses "struct Name { field : Type, ... }", which declares a struct type in the current scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "struct", advanced past the declaration.
 * @param reserved - Words that cannot be used as struct or field names.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseStructDeclaration(
  text: string,
  cursor: Cursor,
  reserved: ReadonlySet<string>,
): Problem | undefined {
  cursor.pos += "struct".length;
  const nameStart = peekStart(text, cursor);
  const name = peekName(text, cursor);
  if (name === "" || reserved.has(name) || isDeclarableType(name)) {
    return { offset: nameStart, expected: "a struct name" };
  }
  cursor.pos += name.length;
  if (peek(text, cursor) !== "{") {
    return { offset: cursor.pos, expected: `"{"` };
  }
  cursor.pos++;
  const fields = new Map<string, string>();
  while (peek(text, cursor) !== "}") {
    const fieldStart = peekStart(text, cursor);
    const field = peekName(text, cursor);
    if (field === "" || reserved.has(field)) {
      return { offset: fieldStart, expected: `a field name or "}"` };
    }
    cursor.pos += field.length;
    if (peek(text, cursor) !== ":") {
      return { offset: cursor.pos, expected: `":" and a type for field "${field}"` };
    }
    cursor.pos++;
    const annotation = parseTypeAnnotation(text, cursor);
    if (!annotation.ok) {
      return annotation.error;
    }
    if (fields.has(field)) {
      return { offset: fieldStart, expected: `a field name not already used in ${name}` };
    }
    fields.set(field, annotation.value);
    if (peek(text, cursor) === ",") {
      cursor.pos++;
    } else if (peek(text, cursor) !== "}") {
      return { offset: cursor.pos, expected: `"," or "}"` };
    }
  }
  cursor.pos++;
  const { scope } = cursor;
  const { structs } = scope;
  structs.set(name, { fields });
  return undefined;
}

/**
 * Parses "Name { field : value, ... }", a struct value. Every field of the struct must be given
 * exactly once, and each value must have the field's declared type.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "{", advanced past the literal.
 * @param name - The struct's name, already read.
 * @param start - Offset of the name, for error reporting.
 * @param parseValue - Parses a field's value.
 * @returns An Ok result with the struct value, or an Err result with the first problem found.
 */
export function parseStructLiteral(
  text: string,
  cursor: Cursor,
  name: string,
  start: number,
  parseValue: ParseValue,
): Result<Value, Problem> {
  const def = lookupStruct(cursor.scope, name);
  if (def === undefined) {
    return err({ offset: start, expected: `a struct named "${name}"` });
  }
  const { fields: declared } = def;
  cursor.pos++;
  const given = new Map<string, Value>();
  while (peek(text, cursor) !== "}") {
    const fieldStart = peekStart(text, cursor);
    const field = peekName(text, cursor);
    const fieldType = declared.get(field);
    if (fieldType === undefined) {
      return err({ offset: fieldStart, expected: `a field of ${name}` });
    }
    if (given.has(field)) {
      return err({ offset: fieldStart, expected: `field "${field}" given only once` });
    }
    cursor.pos += field.length;
    if (peek(text, cursor) !== ":") {
      return err({ offset: cursor.pos, expected: `":"` });
    }
    cursor.pos++;
    const valueStart = peekStart(text, cursor);
    const value = parseValue(text, cursor);
    if (!value.ok) {
      return value;
    }
    const problem = checkTypedValue(value.value, valueStart, fieldType);
    if (problem !== undefined) {
      return err(problem);
    }
    given.set(field, value.value);
    if (peek(text, cursor) === ",") {
      cursor.pos++;
    } else if (peek(text, cursor) !== "}") {
      return err({ offset: cursor.pos, expected: `"," or "}"` });
    }
  }
  cursor.pos++;
  const fields = new Map<string, Value>();
  for (const field of declared.keys()) {
    const value = given.get(field);
    if (value === undefined) {
      return err({ offset: start, expected: `a value for field "${field}" of ${name}` });
    }
    fields.set(field, value);
  }
  return ok({ structName: name, fields });
}
