import { peek, peekName, peekStart, type Problem } from "../lexing";
import { err, ok, type Result } from "../result";
import { claimNamespace, claimObject, lookupNamespace, newScope } from "../scope";
import { type Cursor, type Scope, type Value } from "../types";

/** Parses the statements and closing brace of a body, running them in the scope it is given. */
type ParseBody = (text: string, cursor: Cursor, scope: Scope) => Problem | undefined;

/**
 * Checks whether a name may be declared in a scope, given the kind of declaration. Returns the reason it may not.
 */
type Claim = (scope: Scope, name: string) => string | undefined;

/** Binds a parsed body's exports under its name in the scope that declares it. */
type Bind = (scope: Scope, name: string, exports: Map<string, Value>) => void;

/**
 * Parses "keyword Name { statements }", the shape shared by namespaces and objects. The name is claimed before
 * the body runs, so a rejected declaration runs no code. The body runs in its own scope, and the names it declares
 * with "out let" are its exports; they are then bound under the name.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the keyword, advanced past the declaration.
 * @param keyword - The word that starts the declaration.
 * @param reserved - Words that cannot be used as names.
 * @param claim - Checks that the name may be declared in the scope, before the body runs.
 * @param parseBody - Parses the body after its opening brace, in the scope it is given.
 * @param bind - Binds the exports under the name in the enclosing scope.
 * @returns The first problem found, or undefined if the declaration parsed and was bound.
 */
function parseExportingBlock(
  text: string,
  cursor: Cursor,
  keyword: string,
  reserved: ReadonlySet<string>,
  claim: Claim,
  parseBody: ParseBody,
  bind: Bind,
): Problem | undefined {
  cursor.pos += keyword.length;
  const nameStart = peekStart(text, cursor);
  const name = peekName(text, cursor);
  if (name === "" || reserved.has(name)) {
    return { offset: nameStart, expected: `a ${keyword} name` };
  }
  const reason = claim(cursor.scope, name);
  if (reason !== undefined) {
    return { offset: nameStart, expected: reason };
  }
  cursor.pos += name.length;
  if (peek(text, cursor) !== "{") {
    return { offset: cursor.pos, expected: `"{"` };
  }
  cursor.pos++;
  const { scope: outer } = cursor;
  const exports = new Map<string, Value>();
  const problem = parseBody(text, cursor, { ...newScope(outer), exports });
  if (problem !== undefined) {
    return problem;
  }
  bind(outer, name, exports);
  return undefined;
}

/**
 * Parses "namespace Name { statements }", which declares a namespace in the current scope. Only the names the body
 * declares with "out let" are reachable from outside, as "Name::name".
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
  return parseExportingBlock(text, cursor, "namespace", reserved, claimNamespace, parseBody, (scope, name, exports) => {
    const { namespaces } = scope;
    namespaces.set(name, exports);
  });
}

/**
 * Parses "object Name { statements }", which declares a variable in the current scope whose value is a struct of
 * the body's exports. Its exports are read as "Name.name", the same as a module's.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "object", advanced past the declaration.
 * @param reserved - Words that cannot be used as object names.
 * @param parseBody - Parses the body after its opening brace, in the scope it is given.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseObjectDeclaration(
  text: string,
  cursor: Cursor,
  reserved: ReadonlySet<string>,
  parseBody: ParseBody,
): Problem | undefined {
  return parseExportingBlock(text, cursor, "object", reserved, claimObject, parseBody, (scope, name, exports) => {
    const { vars } = scope;
    vars.set(name, { value: { structName: name, fields: exports }, mutable: false, depth: scope.depth });
  });
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
