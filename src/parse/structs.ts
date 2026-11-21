import { peek, peekName, peekStart, consumeListSeparator, type Problem } from "../lexing";
import { parseTypeAnnotation } from "./annotations";
import {
  bindTypeParams,
  instanceName,
  newTypeScope,
  parseTypeArguments,
  parseTypeParameters,
  substituteTypeParams,
} from "./generics";
import { checkTypedValue, isDeclarableType, lookupStruct } from "../scope";
import { type Cursor, type StructDef, type Value } from "../types";
import { err, ok, type Result } from "../result";

/** Parses one value from the cursor, such as a field's value. */
type ParseValue = (text: string, cursor: Cursor) => Result<Value, Problem>;

/**
 * Parses the fields of a struct declaration, from after "{" through "}", and consumes the "}".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position after "{", advanced past "}".
 * @param name - The struct's name, for error reporting.
 * @param reserved - Words that cannot be used as field names.
 * @returns An Ok result with each field's declared type, or an Err result with the first problem found.
 */
function parseFieldDeclarations(
  text: string,
  cursor: Cursor,
  name: string,
  reserved: ReadonlySet<string>,
): Result<Map<string, string>, Problem> {
  const fields = new Map<string, string>();
  while (peek(text, cursor) !== "}") {
    const fieldStart = peekStart(text, cursor);
    const field = peekName(text, cursor);
    if (field === "" || reserved.has(field)) {
      return err({ offset: fieldStart, expected: `a field name or "}"` });
    }
    cursor.pos += field.length;
    if (peek(text, cursor) !== ":") {
      return err({ offset: cursor.pos, expected: `":" and a type for field "${field}"` });
    }
    cursor.pos++;
    const annotation = parseTypeAnnotation(text, cursor);
    if (!annotation.ok) {
      return err(annotation.error);
    }
    if (fields.has(field)) {
      return err({ offset: fieldStart, expected: `a field name not already used in ${name}` });
    }
    fields.set(field, annotation.value);
    const separator = consumeListSeparator(text, cursor, "}");
    if (separator !== undefined) {
      return err(separator);
    }
  }
  cursor.pos++;
  return ok(fields);
}

/**
 * Parses "struct Name { field : Type, ... }" or "struct Name<T, ...> { field : Type, ... }", which declares a
 * struct type in the current scope. Within a generic struct, each type parameter is a type name in its fields.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "struct", advanced past the declaration.
 * @param reserved - Words that cannot be used as struct, field or type parameter names.
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
  let typeParams: string[] = [];
  if (peek(text, cursor) === "<") {
    const params = parseTypeParameters(text, cursor, reserved);
    if (!params.ok) {
      return params.error;
    }
    typeParams = params.value;
  }
  if (peek(text, cursor) !== "{") {
    return { offset: cursor.pos, expected: `"{"` };
  }
  cursor.pos++;
  const outer = cursor.scope;
  cursor.scope = newTypeScope(outer, bindTypeParams(typeParams, typeParams));
  const fields = parseFieldDeclarations(text, cursor, name, reserved);
  cursor.scope = outer;
  if (!fields.ok) {
    return fields.error;
  }
  const { structs } = outer;
  structs.set(name, { fields: fields.value, typeParams });
  return undefined;
}

/**
 * Replaces each type parameter in a field's type with the type argument it is instantiated with.
 *
 * @param def - The generic struct.
 * @param args - The normalized type arguments, in the same order as the struct's type parameters.
 * @returns The field types of the instance, keyed by field name.
 */
function instantiateFields(def: StructDef, args: readonly string[]): Map<string, string> {
  const { typeParams, fields } = def;
  const bindings = bindTypeParams(typeParams, args);
  return new Map([...fields].map(([field, type]) => [field, substituteTypeParams(type, bindings)]));
}

/**
 * Parses "Name { field : value, ... }", a struct value, or "Name<Type, ...> { field : value, ... }" for a generic
 * struct. Every field of the struct must be given exactly once, and each value must have the field's declared type.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position after the name, advanced past the literal.
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
  const { typeParams } = def;
  let structName = name;
  let declared: ReadonlyMap<string, string> = def.fields;
  if (typeParams.length > 0) {
    const args = parseTypeArguments(text, cursor, name, typeParams.length, parseTypeAnnotation);
    if (!args.ok) {
      return err(args.error);
    }
    structName = instanceName(name, args.value);
    declared = instantiateFields(def, args.value);
  }
  if (peek(text, cursor) !== "{") {
    return err({ offset: cursor.pos, expected: `"{"` });
  }
  cursor.pos++;
  const given = new Map<string, Value>();
  while (peek(text, cursor) !== "}") {
    const fieldStart = peekStart(text, cursor);
    const field = peekName(text, cursor);
    const fieldType = declared.get(field);
    if (fieldType === undefined) {
      return err({ offset: fieldStart, expected: `a field of ${structName}` });
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
      return err({ offset: start, expected: `a value for field "${field}" of ${structName}` });
    }
    fields.set(field, value);
  }
  return ok({ structName, fields });
}
