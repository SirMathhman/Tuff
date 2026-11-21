import { peek, peekName, peekStart, type Position, type Problem } from "../lexing";
import { err, ok, type Result } from "../result";
import {
  claimNamespace,
  claimObject,
  exportedValue,
  isObject,
  lookup,
  lookupNamespace,
  MAX_CALL_DEPTH,
  newScope,
  snapshotScope,
} from "../scope";
import {
  type Cursor,
  type Export,
  type FunctionDef,
  type ObjectBodyParser,
  type StructValue,
  type ObjectTemplate,
  type ObjectValue,
  type Scope,
  type Value,
} from "../types";
import { type CallParser, findBlockEnd, parseCallAndSemicolon } from "./functions";
import { parseModuleInputs, unreadable } from "./imports";

/** Parses one value from the cursor, such as an instance's input. */
type ParseValue = (text: string, cursor: Cursor) => Result<Value, Problem>;

/**
 * Checks whether a name may be declared in a scope, given the kind of declaration. Returns the reason it may not.
 */
type Claim = (scope: Scope, name: string) => string | undefined;

/** Binds a parsed body's exports under its name in the scope that declares it. */
type Bind = (scope: Scope, name: string, exports: Map<string, Export>) => void;

/** The names "this" can read at one point, and whether they are an object body's exports. */
interface ReadableThis {
  /** True inside an object body, where the names are the object's exports. */
  readonly inObject: boolean;
  /** The readable names, each as the export that "this" reads it through. */
  readonly names: ReadonlyMap<string, Export>;
}

/** What distinguishes a namespace declaration from an object declaration. */
interface BlockOptions {
  /** The word that starts the declaration. */
  readonly keyword: string;
  /** Words that cannot be used as names. */
  readonly reserved: ReadonlySet<string>;
  /** Checks that the name may be declared, before the body runs. */
  readonly claim: Claim;
  /** True for an object body, whose "out let" names are live cells and which may export functions. */
  readonly objectBody: boolean;
}

/**
 * Reads "keyword Name" at the cursor, and checks that the name may be declared.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the keyword, advanced past the name.
 * @param keyword - The word that starts the declaration.
 * @param reserved - Words that cannot be used as names.
 * @param claim - Checks that the name may be declared in the scope.
 * @returns An Ok result with the name, or an Err result with the first problem found.
 */
function readDeclaredName(
  text: string,
  cursor: Cursor,
  keyword: string,
  reserved: ReadonlySet<string>,
  claim: Claim,
): Result<string, Problem> {
  cursor.pos += keyword.length;
  const nameStart = peekStart(text, cursor);
  const name = peekName(text, cursor);
  if (name === "" || reserved.has(name)) {
    return err({ offset: nameStart, expected: `a ${keyword} name` });
  }
  const reason = claim(cursor.scope, name);
  if (reason !== undefined) {
    return err({ offset: nameStart, expected: reason });
  }
  cursor.pos += name.length;
  return ok(name);
}

/**
 * Parses "keyword Name { statements }", the shape shared by namespaces and objects. The name is claimed before
 * the body runs, so a rejected declaration runs no code. The body runs in its own scope, and the names it declares
 * with "out" are its exports; they are then bound under the name.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the keyword, advanced past the declaration.
 * @param options - The keyword, reserved words, claim rule, and body kind of the declaration.
 * @param parseBody - Parses the body after its opening brace, in the scope it is given.
 * @param bind - Binds the exports under the name in the enclosing scope.
 * @returns The first problem found, or undefined if the declaration parsed and was bound.
 */
function parseExportingBlock(
  text: string,
  cursor: Cursor,
  options: BlockOptions,
  parseBody: ObjectBodyParser,
  bind: Bind,
): Problem | undefined {
  const { keyword, reserved, claim, objectBody } = options;
  const named = readDeclaredName(text, cursor, keyword, reserved, claim);
  if (!named.ok) {
    return named.error;
  }
  const { value: name } = named;
  if (peek(text, cursor) !== "{") {
    return { offset: cursor.pos, expected: `"{"` };
  }
  cursor.pos++;
  const { scope: outer } = cursor;
  const exports = new Map<string, Export>();
  const problem = parseBody(text, cursor, { ...newScope(outer), exports, objectBody });
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
  parseBody: ObjectBodyParser,
): Problem | undefined {
  const options: BlockOptions = { keyword: "namespace", reserved, claim: claimNamespace, objectBody: false };
  return parseExportingBlock(text, cursor, options, parseBody, (scope, name, exports) => {
    const { namespaces } = scope;
    namespaces.set(name, exports);
  });
}

/**
 * Reports whether an object body declares an input, "in let". The body's own level is checked; nested blocks and
 * comments are skipped.
 *
 * @param text - The source being parsed.
 * @param open - Offset of the body's opening "{".
 * @returns True if the body declares an input.
 */
function declaresInputs(text: string, open: number): boolean {
  let depth = 0;
  for (let pos = open; pos < text.length; pos++) {
    if (text.startsWith("//", pos)) {
      pos = text.indexOf("\n", pos);
      if (pos < 0) {
        return false;
      }
    } else if (text.startsWith("/*", pos)) {
      const close = text.indexOf("*/", pos + 2);
      if (close < 0) {
        return false;
      }
      pos = close + 1;
    } else {
      const char = text.charAt(pos);
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          return false;
        }
      } else if (depth === 1 && isInputKeyword(text, pos)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Reports whether "in let" starts at the given offset, as whole words.
 *
 * @param text - The source being parsed.
 * @param pos - The offset to check.
 * @returns True if "in let" starts here.
 */
function isInputKeyword(text: string, pos: number): boolean {
  if (!text.startsWith("in", pos) || /[A-Za-z0-9_]/.test(text.charAt(pos - 1))) {
    return false;
  }
  const pattern = /in\s+let\b/y;
  pattern.lastIndex = pos;
  return pattern.test(text);
}

/**
 * Parses "object Name { in let ... }", which declares a template. Its body is not run now: each instance runs it
 * again, with the instance's inputs.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "object", advanced past the declaration.
 * @param reserved - Words that cannot be used as object names.
 * @param parseBody - Parses the body after its opening brace, in the scope it is given.
 * @param open - Offset of the body's opening "{".
 * @returns The first problem found, or undefined if the template was declared.
 */
function parseObjectTemplate(
  text: string,
  cursor: Cursor,
  reserved: ReadonlySet<string>,
  parseBody: ObjectBodyParser,
  open: number,
): Problem | undefined {
  const named = readDeclaredName(text, cursor, "object", reserved, claimObject);
  if (!named.ok) {
    return named.error;
  }
  const { value: name } = named;
  const close = findBlockEnd(text, open);
  if (close < 0) {
    return { offset: open, expected: `"}" ending the object body` };
  }
  const snapshot = snapshotScope(cursor.scope);
  const template: ObjectTemplate = { name, scope: snapshot, text, bodyStart: open + 1, parseBody };
  const { templates: snapshotTemplates } = snapshot;
  snapshotTemplates.set(name, template);
  const { templates } = cursor.scope;
  templates.set(name, template);
  cursor.pos = close + 1;
  return undefined;
}

/**
 * Parses "object Name { statements }", which declares a variable in the current scope whose value is an object of
 * the body's exports. Its exports are read as "Name.name", the same as a module's, and its "out fn" functions are
 * called as "Name.fn()". A body that declares an input, "in let", makes a template instead; see parseObjectTemplate.
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
  parseBody: ObjectBodyParser,
): Problem | undefined {
  const open = objectBodyOpen(text, cursor);
  if (open !== undefined && declaresInputs(text, open)) {
    return parseObjectTemplate(text, cursor, reserved, parseBody, open);
  }
  const options: BlockOptions = { keyword: "object", reserved, claim: claimObject, objectBody: true };
  return parseExportingBlock(text, cursor, options, parseBody, (scope, name, exports) => {
    const { vars } = scope;
    const value: ObjectValue = { kind: "object", name, exports };
    vars.set(name, { value, mutable: false, depth: scope.depth });
  });
}

/**
 * Finds the "{" that opens the body of the object declaration at the cursor, without consuming anything.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "object".
 * @returns The offset of the "{", or undefined if the declaration has no body there.
 */
function objectBodyOpen(text: string, cursor: Cursor): number | undefined {
  const probe: Position = { pos: cursor.pos + "object".length };
  peek(text, probe);
  probe.pos += peekName(text, probe).length;
  return peek(text, probe) === "{" ? probe.pos : undefined;
}

/**
 * Parses "Name { input : value, ... }", which builds an instance of an object template: the template's body runs
 * with the given inputs. Every input the body declares with "in let" must be given, and no other input may be.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "{", advanced past the inputs.
 * @param name - The template's name, for error reporting.
 * @param start - Offset of the name, for error reporting.
 * @param template - The template being instantiated.
 * @param parseValue - Parses an input's value.
 * @returns An Ok result with the new object, or an Err result with the first problem found.
 */
export function parseInstance(
  text: string,
  cursor: Cursor,
  name: string,
  start: number,
  template: ObjectTemplate,
  parseValue: ParseValue,
): Result<Value, Problem> {
  if (cursor.callDepth >= MAX_CALL_DEPTH) {
    return err({ offset: start, expected: `an object instance nested within ${MAX_CALL_DEPTH} levels` });
  }
  const inputs = parseModuleInputs(text, cursor, parseValue);
  if (!inputs.ok) {
    return err(inputs.error);
  }
  const { value: inputValues } = inputs;
  const exports = new Map<string, Export>();
  const body: Scope = { ...newScope(template.scope), exports, objectBody: true };
  const inputsUsed = new Set<string>();
  const callDepth = cursor.callDepth + 1;
  const bodyCursor: Cursor = {
    ...cursor,
    pos: template.bodyStart,
    scope: body,
    inputs: inputValues,
    inputsUsed,
    callDepth,
  };
  const problem = template.parseBody(template.text, bodyCursor, body);
  if (problem !== undefined) {
    return err(problem);
  }
  for (const input of inputValues.keys()) {
    if (!inputsUsed.has(input)) {
      return err({ offset: start, expected: `an "in let ${input}" declaration in object "${name}"` });
    }
  }
  const value: ObjectValue = { kind: "object", name, exports, template: name, inputs: inputValues };
  return ok(value);
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
  const value = exported === undefined ? undefined : exportedValue(exported);
  if (value === undefined) {
    return err({ offset: start, expected: `a name exported from namespace "${name}" (declare it with "out let")` });
  }
  return ok(value);
}

/**
 * Returns the object a variable holds, if the name is a variable holding an object.
 *
 * @param scope - The scope to search for the variable.
 * @param name - The variable's name.
 * @returns The object, or undefined if the name is not a variable holding an object.
 */
function objectNamed(scope: Scope, name: string): ObjectValue | undefined {
  const binding = lookup(scope, name);
  if (binding === undefined) {
    return undefined;
  }
  const { value } = binding;
  return isObject(value) ? value : undefined;
}

/**
 * Returns the function an object exports under a name, if it exports one.
 *
 * @param object - The object.
 * @param member - The name of the exported function.
 * @returns The function, or undefined if the object does not export a function with that name.
 */
function exportedFunction(object: ObjectValue, member: string): FunctionDef | undefined {
  const { exports } = object;
  const exported = exports.get(member);
  return exported?.kind === "function" ? exported.fn : undefined;
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
  const object = objectNamed(cursor.scope, name);
  if (object === undefined) {
    return false;
  }
  const probe: Position = { pos: cursor.pos + name.length };
  if (peek(text, probe) !== ".") {
    return false;
  }
  probe.pos++;
  const member = peekName(text, probe);
  probe.pos += member.length;
  return exportedFunction(object, member) !== undefined && peek(text, probe) === "(";
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
  const object = objectNamed(cursor.scope, name);
  const fn = object === undefined ? undefined : exportedFunction(object, member);
  if (fn === undefined) {
    return { offset: start, expected: `a function exported by "${name}"` };
  }
  if (fn.returnType !== "Void") {
    return { offset: start, expected: `a Void function, since "${name}.${member}" is called as a statement` };
  }
  return parseCallAndSemicolon(text, cursor, member, start, fn, parseCall);
}

/**
 * Finds the nearest scope that exports names, walking outward from the given scope.
 *
 * @param scope - The scope to start from.
 * @returns The nearest export scope, or undefined if there is none.
 */
function nearestExportScope(scope: Scope): Scope | undefined {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    const { exports } = current;
    if (exports !== undefined) {
      return current;
    }
  }
  return undefined;
}

/**
 * Selects the names "this" can read at a scope: the exports of the enclosing object body, or else the variables
 * declared directly in the scope. This is the one rule that both bare "this" and "this.name" use.
 *
 * @param scope - The scope "this" is written in.
 * @returns The readable names.
 */
function readableThisNames(scope: Scope): ReadableThis {
  const owner = nearestExportScope(scope);
  if (owner !== undefined && owner.objectBody === true) {
    const { exports } = owner;
    return { inObject: true, names: exports ?? new Map<string, Export>() };
  }
  const names = new Map<string, Export>();
  const { vars } = scope;
  for (const [name, binding] of vars) {
    if (unreadable(binding, 0, name) === undefined) {
      names.set(name, { kind: "value", value: binding.value });
    }
  }
  return { inObject: false, names };
}

/**
 * Builds the value of bare "this": an object whose exports are a snapshot of the names "this.name" can read at this
 * point. The snapshot holds the values at the time it is built, so later assignments are not seen.
 *
 * @param scope - The scope "this" is written in.
 * @returns The snapshot object.
 */
function thisSnapshot(scope: Scope): StructValue {
  const { names } = readableThisNames(scope);
  const fields = new Map<string, Value>();
  for (const [name, exported] of names) {
    const value = exportedValue(exported);
    if (value !== undefined) {
      fields.set(name, value);
    }
  }
  return { structName: enclosingFunctionName(scope), fields };
}

/**
 * Names the struct a bare "this" builds: the name of the nearest enclosing function call, or "this" outside any call.
 *
 * @param scope - The scope "this" is written in.
 * @returns The function's name, or "this".
 */
function enclosingFunctionName(scope: Scope): string {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    const { functionName } = current;
    if (functionName !== undefined) {
      return functionName;
    }
  }
  return "this";
}

/**
 * Parses ".name" after "this", which reads a name this can read at the current point. Bare "this" is handled by
 * the caller and is not seen here. A function must be called, not read.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position just after "this", advanced past the name.
 * @param start - Offset of "this", for error reporting.
 * @returns An Ok result with the current value of the name, or an Err result with the first problem found.
 */
export function parseThisMember(text: string, cursor: Cursor, start: number): Result<Value, Problem> {
  if (peek(text, cursor) !== ".") {
    return ok(thisSnapshot(cursor.scope));
  }
  cursor.pos++;
  const member = peekName(text, cursor);
  if (member === "") {
    return err({ offset: cursor.pos, expected: `a name after "this."` });
  }
  cursor.pos += member.length;
  const { inObject, names } = readableThisNames(cursor.scope);
  const exported = names.get(member);
  if (exported?.kind === "function") {
    return err({ offset: start, expected: `a call to "this.${member}()" (a function is called, not read)` });
  }
  const value = exported === undefined ? undefined : exportedValue(exported);
  if (value === undefined) {
    const where = inObject ? "a name this object exports" : "a variable declared in this scope";
    return err({ offset: start, expected: `${where} (no "${member}" is available here)` });
  }
  return ok(value);
}

/**
 * Finds the scope of the nearest call of a function with the given name, walking outward from a scope.
 *
 * @param scope - The scope to start from.
 * @param name - The function's name.
 * @returns The call's scope, or undefined if no enclosing call has that name.
 */
function callScopeNamed(scope: Scope, name: string): Scope | undefined {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    if (current.functionName === name) {
      return current;
    }
  }
  return undefined;
}

/**
 * Reports whether ".this" follows a name that is an enclosing function call, such as "Wrapper.this" inside fn Wrapper.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position just after the name.
 * @param name - The name that was read.
 * @returns True if the name is followed by ".this" and names an enclosing call.
 */
export function isCallThisAhead(text: string, cursor: Cursor, name: string): boolean {
  return (
    text.startsWith(".this", cursor.pos) &&
    !/[A-Za-z0-9_]/.test(text.charAt(cursor.pos + ".this".length)) &&
    callScopeNamed(cursor.scope, name) !== undefined
  );
}

/**
 * Parses ".this" after the name of an enclosing function call: a snapshot of the variables of that call.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at ".this", advanced past it.
 * @param start - Offset of the name, for error reporting.
 * @param name - The function's name.
 * @returns An Ok result with the snapshot, or an Err result with the first problem found.
 */
export function parseCallThis(text: string, cursor: Cursor, start: number, name: string): Result<Value, Problem> {
  cursor.pos += ".this".length;
  const call = callScopeNamed(cursor.scope, name);
  if (call === undefined) {
    return err({ offset: start, expected: `a call of "${name}" enclosing this point` });
  }
  // The call's variables are those of every frame from here out to the call; an inner frame shadows an outer one.
  const fields = new Map<string, Value>();
  for (let frame: Scope | undefined = cursor.scope; frame !== undefined; frame = frame.parent) {
    for (const [key, binding] of frame.vars) {
      if (!fields.has(key) && unreadable(binding, start, key) === undefined) {
        fields.set(key, binding.value);
      }
    }
    if (frame === call) {
      break;
    }
  }
  return ok({ structName: name, fields });
}
