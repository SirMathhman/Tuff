import { peek, peekName, consumeListSeparator, type Problem } from "../lexing";
import { checkDeclaration, isStruct } from "../scope";
import { RESERVED_WORDS } from "../keywords";
import { type Cursor, type Value } from "../types";
import { type Result } from "../result";

/** Parses "= expression;", checking the value with the given check before it is accepted. */
type Initializer = (
  text: string,
  cursor: Cursor,
  check: (value: Value, offset: number) => Problem | undefined,
) => Result<Value, Problem>;

/**
 * Parses "{ field, ... } = expression;", which binds each named field of a struct value to a
 * variable of the same name in the current scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "{", advanced past the declaration.
 * @param mutable - True if the bindings were declared with "let mut".
 * @param parseInitializer - Parses the "= expression;" part and checks the value.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseDestructuring(
  text: string,
  cursor: Cursor,
  mutable: boolean,
  parseInitializer: Initializer,
): Problem | undefined {
  const start = cursor.pos;
  cursor.pos++;
  const names: string[] = [];
  const externNames = new Set<string>();
  while (peek(text, cursor) !== "}") {
    const isExtern = peekName(text, cursor) === "extern";
    if (isExtern) {
      cursor.pos += "extern".length;
    }
    const name = peekName(text, cursor);
    if (isExtern) {
      externNames.add(name);
    }
    if (name === "" || RESERVED_WORDS.has(name)) {
      return { offset: cursor.pos, expected: `a field name or "}"` };
    }
    cursor.pos += name.length;
    names.push(name);
    const separator = consumeListSeparator(text, cursor, "}");
    if (separator !== undefined) {
      return separator;
    }
  }
  cursor.pos++;
  if (names.length === 0) {
    return { offset: start, expected: `a field name inside "{ }"` };
  }
  const { scope } = cursor;
  const { depth } = scope;
  const init = parseInitializer(text, cursor, (value, offset) => {
    if (!isStruct(value)) {
      return { offset, expected: `a struct to destructure` };
    }
    const { fields, native } = value;
    const mismatch = names.find((name) => externNames.has(name) !== (native === true));
    if (mismatch !== undefined) {
      return {
        offset,
        expected: native === true ? "extern on each field of an extern module" : "no extern on fields of a Tuff module",
      };
    }
    const missing = names.find((name) => !fields.has(name));
    if (missing !== undefined) {
      return { offset, expected: `a struct with a field named "${missing}"` };
    }
    return checkDeclaration(value, offset, depth);
  });
  if (!init.ok) {
    return init.error;
  }
  if (!isStruct(init.value)) {
    return { offset: start, expected: `a struct to destructure` };
  }
  const { fields } = init.value;
  const { vars } = scope;
  for (const name of names) {
    const fieldValue = fields.get(name);
    if (fieldValue !== undefined) {
      vars.set(name, { value: fieldValue, mutable, depth, extern: externNames.has(name) });
    }
  }
  return undefined;
}
