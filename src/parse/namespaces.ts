import { peek, peekName, peekStart, type Problem } from "../lexing";
import { err, ok, type Result } from "../result";
import { lookupNamespace, newScope } from "../scope";
import { type Cursor, type Scope, type Value } from "../types";

/** Parses the statements and closing brace of a namespace body, running them in the scope it is given. */
type ParseBody = (text: string, cursor: Cursor, scope: Scope) => Problem | undefined;

/**
 * Parses "namespace Name { statements }", which declares a namespace in the current scope. The body runs in its
 * own scope; only the names it declares with "out let" are reachable from outside, as "Name::name".
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "namespace", advanced past the declaration.
 * @param reserved - Words that cannot be used as namespace names.
 * @param parseBody - Parses the body after its opening brace, in the scope it is given.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseNamespaceDeclaration(
  text: string,
  cursor: Cursor,
  reserved: ReadonlySet<string>,
  parseBody: ParseBody,
): Problem | undefined {
  cursor.pos += "namespace".length;
  const nameStart = peekStart(text, cursor);
  const name = peekName(text, cursor);
  if (name === "" || reserved.has(name)) {
    return { offset: nameStart, expected: "a namespace name" };
  }
  cursor.pos += name.length;
  const { scope: outer } = cursor;
  const { namespaces } = outer;
  if (namespaces.has(name)) {
    return { offset: nameStart, expected: `a namespace name not already declared in this scope` };
  }
  const { vars } = outer;
  if (vars.has(name)) {
    return { offset: nameStart, expected: `a namespace name not already used by a variable in this scope` };
  }
  if (peek(text, cursor) !== "{") {
    return { offset: cursor.pos, expected: `"{"` };
  }
  cursor.pos++;
  const exports = new Map<string, Value>();
  const problem = parseBody(text, cursor, { ...newScope(outer), exports });
  if (problem !== undefined) {
    return problem;
  }
  namespaces.set(name, exports);
  return undefined;
}

/**
 * Reports whether "::" follows a name in the cursor's scope that is a namespace. Such a name is read as
 * "Name::member" rather than as a variable or a module path.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position just after the name, with whitespace already skipped.
 * @param name - The name that was read.
 * @returns True if the name is a namespace followed by "::".
 */
export function isNamespaceAccess(text: string, cursor: Cursor, name: string): boolean {
  return text.startsWith("::", cursor.pos) && lookupNamespace(cursor.scope, name) !== undefined;
}

/**
 * Parses "::member" after a namespace name, and yields the value the namespace exports under that name.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "::", advanced past the member name.
 * @param start - Offset of the namespace name, for error reporting.
 * @param name - The namespace's name.
 * @returns An Ok result with the exported value, or an Err result with the first problem found.
 */
export function parseNamespaceMember(
  text: string,
  cursor: Cursor,
  start: number,
  name: string,
): Result<Value, Problem> {
  const namespace = lookupNamespace(cursor.scope, name);
  cursor.pos += "::".length;
  const member = peekName(text, cursor);
  if (member === "") {
    return err({ offset: cursor.pos, expected: `a name exported from namespace "${name}"` });
  }
  cursor.pos += member.length;
  const exported = namespace?.get(member);
  if (exported === undefined) {
    return err({ offset: start, expected: `a name exported from namespace "${name}" (declare it with "out let")` });
  }
  return ok(exported);
}
