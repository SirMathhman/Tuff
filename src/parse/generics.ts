import { peek, peekName, peekStart, type Problem } from "../lexing";
import { isDeclarableType, newScope } from "../scope";
import { type Cursor, type Scope } from "../types";
import { err, ok, type Result } from "../result";

/**
 * Type parameters and type arguments of generic structs and functions, shared by their declarations, annotations and
 * calls. The item parsers are passed in, so this file does not import the annotation parser.
 */

/**
 * Builds the name of an instance of a generic struct, such as "Wrapper<I32>" from "Wrapper" and ["I32"].
 *
 * @param base - The generic struct's name.
 * @param args - The normalized type arguments, in order.
 * @returns The instance's name.
 */
export function instanceName(base: string, args: readonly string[]): string {
  return `${base}<${args.join(", ")}>`;
}

/**
 * Parses "<Type, ...>", the type arguments that instantiate a generic struct, and consumes them.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "<", advanced past ">".
 * @param name - The generic struct's name, for error reporting.
 * @param count - The number of type parameters the struct declares.
 * @param parseType - Parses one type argument, such as the annotation parser.
 * @returns An Ok result with the normalized argument types, or an Err result with the first problem found.
 */
export function parseTypeArguments(
  text: string,
  cursor: Cursor,
  name: string,
  count: number,
  parseType: (text: string, cursor: Cursor) => Result<string, Problem>,
): Result<string[], Problem> {
  const start = peekStart(text, cursor);
  if (peek(text, cursor) !== "<") {
    return err({ offset: start, expected: `type arguments for ${name}, such as ${name}<I32>` });
  }
  const args = parseAngleList(text, cursor, parseType);
  if (!args.ok) {
    return args;
  }
  const { value: types } = args;
  if (types.length !== count) {
    return err({ offset: start, expected: `${count} type argument${count === 1 ? "" : "s"} for ${name}` });
  }
  return args;
}

/**
 * Parses "<item, ...>", a non-empty list of items between angle brackets, and consumes the brackets.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "<", advanced past ">".
 * @param parseItem - Parses one item, advancing the cursor past it.
 * @returns An Ok result with the items in order, or an Err result with the first problem found.
 */
export function parseAngleList<T>(
  text: string,
  cursor: Cursor,
  parseItem: (text: string, cursor: Cursor) => Result<T, Problem>,
): Result<T[], Problem> {
  if (peek(text, cursor) !== "<") {
    return err({ offset: cursor.pos, expected: `"<"` });
  }
  cursor.pos++;
  const items: T[] = [];
  let separator = ",";
  while (separator === ",") {
    const item = parseItem(text, cursor);
    if (!item.ok) {
      return err(item.error);
    }
    items.push(item.value);
    separator = peek(text, cursor);
    if (separator === ",") {
      cursor.pos++;
    }
  }
  if (separator !== ">") {
    return err({ offset: cursor.pos, expected: `"," or ">"` });
  }
  cursor.pos++;
  return ok(items);
}

/**
 * Parses "<T, ...>", the type parameters of a generic struct or function, and consumes them.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "<", advanced past ">".
 * @param reserved - Words that cannot be used as type parameter names.
 * @returns An Ok result with the parameter names, or an Err result with the first problem found.
 */
export function parseTypeParameters(
  text: string,
  cursor: Cursor,
  reserved: ReadonlySet<string>,
): Result<string[], Problem> {
  const names: string[] = [];
  return parseAngleList(text, cursor, (source, position) => {
    const start = peekStart(source, position);
    const param = peekName(source, position);
    if (param === "" || reserved.has(param) || isDeclarableType(param) || names.includes(param)) {
      return err({ offset: start, expected: "a type parameter name not already used" });
    }
    position.pos += param.length;
    names.push(param);
    return ok(param);
  });
}

/**
 * Pairs each type parameter with the type argument it stands for. A parameter without an argument stands for itself.
 *
 * @param params - The type parameter names, in order.
 * @param args - The normalized type arguments, in the same order.
 * @returns The bindings, keyed by parameter name.
 */
export function bindTypeParams(params: readonly string[], args: readonly string[]): Map<string, string> {
  return new Map(params.map((param, index) => [param, args[index] ?? param]));
}

/**
 * Creates a scope nested in the given one, in which each bound name is a type alias for its binding.
 * Annotations parsed in this scope see the bound names as the types they stand for.
 *
 * @param parent - The enclosing scope.
 * @param bindings - The type aliases to declare, keyed by name.
 * @returns The new scope.
 */
export function newTypeScope(parent: Scope, bindings: ReadonlyMap<string, string>): Scope {
  const scope = newScope(parent);
  const { types } = scope;
  for (const [name, type] of bindings) {
    types.set(name, type);
  }
  return scope;
}

/**
 * Replaces each name in a type string that is bound, such as "T" in "Wrapper<T>", with what it is bound to.
 *
 * @param type - The normalized type string.
 * @param bindings - The replacements, keyed by name.
 * @returns The type with the replacements applied.
 */
export function substituteTypeParams(type: string, bindings: ReadonlyMap<string, string>): string {
  return type.replace(/[A-Za-z_]\w*/g, (token) => bindings.get(token) ?? token);
}
