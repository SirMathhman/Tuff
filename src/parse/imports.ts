import { peekName, type Problem } from "../lexing";
import { type Cursor, type Value } from "../types";
import { err, ok, type Result } from "../result";

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
  const { modules } = cursor;
  const loaded = modules(moduleName);
  if (loaded === undefined) {
    return err({ offset: start, expected: `a variable or module in scope (no "${moduleName}" is defined)` });
  }
  if (!loaded.ok) {
    return err({ offset: start, expected: `module "${moduleName}" to load (${loaded.error})` });
  }
  const { value: moduleExports } = loaded;
  const exported = moduleExports.get(member);
  if (exported === undefined) {
    return err({ offset: start, expected: `a name exported from "${moduleName}" (declare it with "out let")` });
  }
  return ok(exported);
}

/**
 * Parses "out let name ...", a declaration whose name the module exports. Only allowed at the top level.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at "out", advanced past the declaration.
 * @param parseDeclaration - Parses the "let" declaration that follows "out".
 * @returns The first problem found, or undefined if the declaration parsed.
 */
export function parseExportDeclaration(
  text: string,
  cursor: Cursor,
  parseDeclaration: (text: string, cursor: Cursor) => Problem | undefined,
): Problem | undefined {
  const { scope } = cursor;
  if (scope.depth !== 0) {
    return { offset: cursor.pos, expected: `"out" only at the top level of a module` };
  }
  cursor.pos += "out".length;
  if (peekName(text, cursor) !== "let") {
    return { offset: cursor.pos, expected: `"let" after "out"` };
  }
  const letStart = cursor.pos;
  cursor.pos += "let".length;
  const exportedName = peekName(text, cursor);
  cursor.pos = letStart;
  const problem = parseDeclaration(text, cursor);
  if (problem !== undefined) {
    return problem;
  }
  const { vars } = scope;
  const binding = vars.get(exportedName);
  if (binding !== undefined) {
    const { exported } = cursor;
    exported.set(exportedName, binding.value);
  }
  return undefined;
}
