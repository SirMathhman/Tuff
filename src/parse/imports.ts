import { consumeListSeparator, peek, peekName, type Problem } from "../lexing";
import { type Binding, type Cursor, type ModuleExports, type Value } from "../types";
import { parseFunctionDeclaration, parseHostVariable, parseInputLet } from "./functions";
import { err, ok, type Result } from "../result";

/** Parses one value from the cursor, such as a module input. */
type ParseValue = (text: string, cursor: Cursor) => Result<Value, Problem>;

/** The modifiers written before "let" or "fn" in a declaration. */
interface Modifiers {
  /** True if the statement has the "out" modifier, so the name is exported. */
  readonly out: boolean;
  /** True if the statement has the "in" modifier, so the name is a module input. */
  readonly input: boolean;
  /** True if the statement has the "declare" modifier, so the value comes from an earlier binding or the host. */
  readonly declared: boolean;
}

/**
 * Parses ".name" after a module name, and yields the value the module exports under that name.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at ".", advanced past the name.
 * @param start - Offset of the module name, for error reporting.
 * @param moduleName - The name the source used for the module.
 * @returns An Ok result with the exported value, or an Err result with the first problem found.
 */
export function parseModuleMember(
  text: string,
  cursor: Cursor,
  start: number,
  moduleName: string,
): Result<Value, Problem> {
  cursor.pos++;
  const member = peekName(text, cursor);
  if (member === "") {
    return err({ offset: cursor.pos, expected: `a name exported by module "${moduleName}"` });
  }
  cursor.pos += member.length;
  const loaded = loadExports(cursor, start, moduleName, false, new Map());
  if (!loaded.ok) {
    return loaded;
  }
  const { values: moduleExports } = loaded.value;
  const exported = moduleExports.get(member);
  if (exported === undefined) {
    return err({ offset: start, expected: `a name exported from "${moduleName}" (declare it with "out let")` });
  }
  return ok(exported);
}

/**
 * Parses a declaration that starts with any of the modifiers "out", "in" and "declare", in any order,
 * followed by "let" or "fn". "out" exports the name; "in" makes a module input; "declare" takes the value or
 * function from an earlier extern binding or from the host.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the first modifier, advanced past the declaration.
 * @param parseDeclaration - Parses a plain "let" declaration.
 * @returns The first problem found, or undefined if the statement parsed.
 */
export function parseModifiedStatement(
  text: string,
  cursor: Cursor,
  parseDeclaration: (text: string, cursor: Cursor) => Problem | undefined,
): Problem | undefined {
  const modifiers = readModifiers(text, cursor);
  if (!modifiers.ok) {
    return modifiers.error;
  }
  const { out, input, declared } = modifiers.value;
  if (input && declared) {
    return { offset: cursor.pos, expected: '"in" and "declare" cannot be combined' };
  }
  if (input) {
    return parseInputLet(text, cursor, out);
  }
  const keyword = peekName(text, cursor);
  if (keyword === "fn") {
    if (out && !declared) {
      return parseExportedFunction(text, cursor);
    }
    if (!declared || out) {
      return { offset: cursor.pos, expected: '"declare fn" (a function is declared, not exported)' };
    }
    return parseFunctionDeclaration(text, cursor);
  }
  if (keyword !== "let") {
    return { offset: cursor.pos, expected: '"let" or "fn" after the modifiers' };
  }
  if (out) {
    return exportLet(text, cursor, declared, parseDeclaration);
  }
  return declared ? parseHostVariable(text, cursor) : parseDeclaration(text, cursor);
}

/**
 * Parses "out fn name(...) => body;" in the body of an object, which declares the function and exports it so that
 * "Name.name()" calls it. Only an object body exports functions.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "fn", advanced past the declaration.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
function parseExportedFunction(text: string, cursor: Cursor): Problem | undefined {
  const { scope } = cursor;
  const { exports, functions, objectBody } = scope;
  if (exports === undefined || objectBody !== true) {
    return { offset: cursor.pos, expected: '"out fn" only in the body of an object' };
  }
  peek(text, cursor);
  const declStart = cursor.pos;
  cursor.pos += "fn".length;
  const name = peekName(text, cursor);
  cursor.pos = declStart;
  const problem = parseFunctionDeclaration(text, cursor);
  if (problem !== undefined) {
    return problem;
  }
  const fn = functions.get(name);
  if (fn !== undefined) {
    exports.set(name, { kind: "function", fn });
  }
  return undefined;
}

/**
 * Reads the modifiers at the cursor, each at most once, in any order.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the first modifier, advanced past the modifiers.
 * @returns An Ok result with the modifiers, or an Err result if one repeats.
 */
function readModifiers(text: string, cursor: Cursor): Result<Modifiers, Problem> {
  const found = new Set<string>();
  while (true) {
    const word = peekName(text, cursor);
    if (word !== "out" && word !== "in" && word !== "declare") {
      break;
    }
    if (found.has(word)) {
      return err({ offset: cursor.pos, expected: `each modifier at most once, but "${word}" repeats` });
    }
    found.add(word);
    cursor.pos += word.length;
  }
  return ok({ out: found.has("out"), input: found.has("in"), declared: found.has("declare") });
}

/**
 * Parses an exported "let" (or "declare let") at the top level, and records the name's value as an export.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "let", advanced past the declaration.
 * @param declared - True if the statement has the "declare" modifier.
 * @param parseDeclaration - Parses a plain "let" declaration.
 * @returns The first problem found, or undefined if the declaration parsed.
 */
function exportLet(
  text: string,
  cursor: Cursor,
  declared: boolean,
  parseDeclaration: (text: string, cursor: Cursor) => Problem | undefined,
): Problem | undefined {
  const { scope } = cursor;
  const { exports } = scope;
  if (exports === undefined) {
    return { offset: cursor.pos, expected: '"out" only at the top level of a module or namespace' };
  }
  const letStart = cursor.pos;
  cursor.pos += "let".length;
  if (peekName(text, cursor) === "mut") {
    cursor.pos += "mut".length;
  }
  const exportedName = peekName(text, cursor);
  cursor.pos = letStart;
  const problem = declared ? parseHostVariable(text, cursor) : parseDeclaration(text, cursor);
  if (problem !== undefined) {
    return problem;
  }
  const { vars } = scope;
  const binding = vars.get(exportedName);
  if (binding !== undefined) {
    const { objectBody } = scope;
    exports.set(
      exportedName,
      objectBody === true ? { kind: "cell", cell: binding } : { kind: "value", value: binding.value },
    );
  }
  return undefined;
}

/**
 * Yields a module as a value: a struct whose fields are the module's exported values.
 *
 * @param cursor - The parse state, which supplies the module loader.
 * @param start - Offset of the module name, for error reporting.
 * @param moduleName - The name the source used for the module.
 * @param native - True if the name was written with "extern" and refers to a native module.
 * @param inputs - The values passed to the module, by input name; empty for no inputs.
 * @returns An Ok result with the module value, or an Err result if no module with that name loads.
 */
export function parseModuleValue(
  cursor: Cursor,
  start: number,
  moduleName: string,
  native: boolean,
  inputs: ReadonlyMap<string, Value>,
): Result<Value, Problem> {
  const loaded = loadExports(cursor, start, moduleName, native, inputs);
  if (!loaded.ok) {
    return loaded;
  }
  const { values, live } = loaded.value;
  return ok({ structName: moduleName, fields: values, native, live });
}

/**
 * Loads a module by name and returns its exported values, or explains why it cannot be used.
 *
 * @param cursor - The parse state, which supplies the module loader.
 * @param start - Offset of the module name, for error reporting.
 * @param moduleName - The name the source used for the module.
 * @param native - True if the name refers to a native module rather than a Tuff module.
 * @param inputs - The values passed to the module, by input name.
 * @returns An Ok result with the exported values, or an Err result with the first problem found.
 */
function loadExports(
  cursor: Cursor,
  start: number,
  moduleName: string,
  native: boolean,
  inputs: ReadonlyMap<string, Value>,
): Result<ModuleExports, Problem> {
  const loaded = cursor.modules(moduleName, native, inputs);
  if (loaded === undefined) {
    return err({ offset: start, expected: `a variable or module in scope (no "${moduleName}" is defined)` });
  }
  if (!loaded.ok) {
    return err({ offset: start, expected: `module "${moduleName}" to load (${loaded.error})` });
  }
  return ok(loaded.value);
}

/**
 * Parses the module name after "extern" in an expression, and yields that module as a value.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position after "extern", advanced past the module name.
 * @param start - Offset of "extern", for error reporting.
 * @returns An Ok result with the module value, or an Err result with the first problem found.
 */
export function parseExternValue(text: string, cursor: Cursor, start: number): Result<Value, Problem> {
  const moduleName = peekName(text, cursor);
  if (moduleName === "") {
    return err({ offset: cursor.pos, expected: `a module name after "extern"` });
  }
  cursor.pos += moduleName.length;
  return parseModuleValue(cursor, start, moduleName, true, new Map());
}

/**
 * Handles a name that is not a variable: "name.member" reads a Tuff module's export, and a bare name
 * yields the module as a value.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position after the name.
 * @param start - Offset of the name, for error reporting.
 * @param name - The name that is not a variable.
 * @param parseValue - Parses a module input value.
 * @returns An Ok result with the value, or an Err result with the first problem found.
 */
export function parseUnboundName(
  text: string,
  cursor: Cursor,
  start: number,
  name: string,
  parseValue: ParseValue,
): Result<Value, Problem> {
  const path = readModulePath(text, cursor, name);
  if (peek(text, cursor) === "{") {
    const inputs = parseModuleInputs(text, cursor, parseValue);
    if (!inputs.ok) {
      return inputs;
    }
    return parseModuleValue(cursor, start, path, false, inputs.value);
  }
  if (peek(text, cursor) === ".") {
    return parseModuleMember(text, cursor, start, path);
  }
  return parseModuleValue(cursor, start, path, false, new Map());
}

/**
 * Parses "{ name : value, ... }" after a module name: the inputs passed to that module.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "{", advanced past the inputs.
 * @param parseValue - Parses an input's value.
 * @returns An Ok result with the inputs, or an Err result with the first problem found.
 */
export function parseModuleInputs(
  text: string,
  cursor: Cursor,
  parseValue: ParseValue,
): Result<ReadonlyMap<string, Value>, Problem> {
  cursor.pos++;
  const inputs = new Map<string, Value>();
  while (peek(text, cursor) !== "}") {
    const name = peekName(text, cursor);
    if (name === "") {
      return err({ offset: cursor.pos, expected: 'an input name or "}"' });
    }
    cursor.pos += name.length;
    if (peek(text, cursor) !== ":") {
      return err({ offset: cursor.pos, expected: `":" after input "${name}"` });
    }
    cursor.pos++;
    const value = parseValue(text, cursor);
    if (!value.ok) {
      return value;
    }
    inputs.set(name, value.value);
    const separator = consumeListSeparator(text, cursor, "}");
    if (separator !== undefined) {
      return err(separator);
    }
  }
  cursor.pos++;
  return ok(inputs);
}

/**
 * Reads the rest of a module path written as "foo::bar::baz", after its first segment. The segments are
 * joined with "/", which is how a module's source is keyed.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position just after the first segment, advanced past the rest of the path.
 * @param first - The first segment, already read.
 * @returns The module path, such as "foo/bar".
 */
function readModulePath(text: string, cursor: Cursor, first: string): string {
  let path = first;
  while (text.startsWith("::", cursor.pos)) {
    cursor.pos += 2;
    const segment = peekName(text, cursor);
    if (segment === "") {
      break;
    }
    cursor.pos += segment.length;
    path = path + "/" + segment;
  }
  return path;
}

/**
 * Reports why a variable cannot be read as a plain value, if it cannot: an extern function, or an
 * extern value that has no type yet.
 *
 * @param binding - The variable being read.
 * @param start - Offset of the name, for error reporting.
 * @param name - The variable's name.
 * @returns The problem found, or undefined if the variable can be read.
 */
export function unreadable(binding: Binding, start: number, name: string): Problem | undefined {
  if (binding.host !== undefined) {
    return { offset: start, expected: `a call to extern function "${name}" (it cannot be read as a value)` };
  }
  if (binding.extern === true && binding.type === undefined) {
    return { offset: start, expected: `a type for extern "${name}" (declare it with declare let ${name} : T)` };
  }
  return undefined;
}
