import { peek, peekName, peekStart, type Position, type Problem } from "../lexing";
import { err, ok, type Result } from "../result";
import { claimNamespace, claimObject, isStruct, lookup, lookupNamespace, newScope } from "../scope";
import { type Binding, type Cursor, type FunctionDef, type Scope, type Value } from "../types";
import { type CallParser, parseCallAndSemicolon } from "./functions";

/** Parses the statements and closing brace of a body, running them in the scope it is given. */
type ParseBody = (text: string, cursor: Cursor, scope: Scope) => Problem | undefined;

/**
 * Checks whether a name may be declared in a scope, given the kind of declaration. Returns the reason it may not.
 */
type Claim = (scope: Scope, name: string) => string | undefined;

/** Binds a parsed body's exports under its name in the scope that declares it. */
type Bind = (scope: Scope, name: string, exports: Map<string, Value>, body: Scope) => void;

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
 * @param functionsExported - True if the body may export functions with "out fn".
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
  functionsExported: boolean,
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
  const body: Scope = {
    ...newScope(outer),
    exports,
    ...(functionsExported ? { exportedFunctions: new Map<string, FunctionDef>() } : {}),
  };
  const problem = parseBody(text, cursor, body);
  if (problem !== undefined) {
    return problem;
  }
  bind(outer, name, exports, body);
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
  return parseExportingBlock(
    text,
    cursor,
    "namespace",
    reserved,
    claimNamespace,
    false,
    parseBody,
    (scope, name, exports) => {
      const { namespaces } = scope;
      namespaces.set(name, exports);
    },
  );
}

/**
 * Parses "object Name { statements }", which declares a variable in the current scope whose value is a struct of
 * the body's exports. Its exports are read as "Name.name", the same as a module's, and its "out fn" functions are
 * called as "Name.fn()".
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
  return parseExportingBlock(
    text,
    cursor,
    "object",
    reserved,
    claimObject,
    true,
    parseBody,
    (scope, name, exports, body) => {
      const { vars } = scope;
      const cells = new Map<string, Binding>();
      const { vars: bodyVars } = body;
      for (const key of exports.keys()) {
        const cell = bodyVars.get(key);
        if (cell !== undefined) {
          cells.set(key, cell);
        }
      }
      const { exportedFunctions } = body;
      const value = { structName: name, fields: exports, cells, functions: exportedFunctions };
      vars.set(name, { value, mutable: false, depth: scope.depth });
    },
  );
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

/**
 * Returns the functions an object variable exports, if the name is a variable holding an object.
 *
 * @param scope - The scope to search for the variable.
 * @param name - The variable's name.
 * @returns The object's exported functions, or undefined if the name is not an object.
 */
function objectFunctions(scope: Scope, name: string): ReadonlyMap<string, FunctionDef> | undefined {
  const binding = lookup(scope, name);
  if (binding === undefined) {
    return undefined;
  }
  const { value } = binding;
  return isStruct(value) ? value.functions : undefined;
}

/**
 * Reports whether a statement starts with "Name.fn(" where Name is an object that exports fn.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the name, which has not been consumed.
 * @param name - The name at the cursor.
 * @returns True if the statement is a call to a function exported by an object.
 */
export function isObjectCallAhead(text: string, cursor: Cursor, name: string): boolean {
  const functions = objectFunctions(cursor.scope, name);
  if (functions === undefined) {
    return false;
  }
  const probe: Position = { pos: cursor.pos + name.length };
  if (peek(text, probe) !== ".") {
    return false;
  }
  probe.pos++;
  const member = peekName(text, probe);
  probe.pos += member.length;
  return functions.has(member) && peek(text, probe) === "(";
}

/**
 * Parses "Name.fn(...);" where Name is an object and fn is a Void function it exports, and discards its result.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the object name, advanced past the ";".
 * @param name - The object's name.
 * @param parseCall - Parses the call's arguments and body.
 * @returns The first problem found, or undefined if the statement parsed.
 */
export function parseObjectCallStatement(
  text: string,
  cursor: Cursor,
  name: string,
  parseCall: CallParser,
): Problem | undefined {
  const start = cursor.pos;
  cursor.pos += name.length;
  peek(text, cursor);
  cursor.pos++;
  const member = peekName(text, cursor);
  cursor.pos += member.length;
  const fn = objectFunctions(cursor.scope, name)?.get(member);
  if (fn === undefined) {
    return { offset: start, expected: `a function exported by "${name}"` };
  }
  if (fn.returnType !== "Void") {
    return { offset: start, expected: `a Void function, since "${name}.${member}" is called as a statement` };
  }
  return parseCallAndSemicolon(text, cursor, member, start, fn, parseCall);
}
