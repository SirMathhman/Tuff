/**
 * Scope lookup and small value helpers for the Tuff parser. Nothing here parses text.
 */
import { type Value, type Binding, type Scope, type FunctionDef, type Cursor, type LoopExit } from "./tuff-types";
import { findTopLevel } from "./tuff-lexing";

/**
 * Finds the value of a variable in the given scope or the scopes enclosing it.
 *
 * @param scope - The innermost scope to search first.
 * @param name - The variable name to look up.
 * @returns The binding of the nearest declaration of the name, or undefined if none is in scope.
 */
export function lookup(scope: Scope, name: string): Binding | undefined {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    const { vars } = current;
    const binding = vars.get(name);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}
/**
 * Finds a function declared in the given scope or the scopes enclosing it.
 *
 * @param scope - The innermost scope to search first.
 * @param name - The function name to look up.
 * @returns The nearest declaration of the name, or undefined if none is in scope.
 */
export function lookupFunction(scope: Scope, name: string): FunctionDef | undefined {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    const { functions } = current;
    const found = functions.get(name);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
/**
 * Creates an empty scope nested in the given parent, or the program's outermost scope if there is none.
 *
 * @param parent - The enclosing scope, or undefined for the outermost scope.
 * @returns The new scope.
 */
export function newScope(parent?: Scope): Scope {
  return { vars: new Map(), functions: new Map(), parent, depth: parent === undefined ? 0 : parent.depth + 1 };
}
/**
 * Returns the offset of the ";" that ends a function body, or -1 if there is none. Only scans
 * characters, so nothing is parsed or evaluated.
 *
 * @param text - The source being parsed.
 * @param start - Offset where the body starts.
 * @returns The offset of the ending ";", or -1.
 */
export function findFunctionBodyEnd(text: string, start: number): number {
    return findTopLevel(text, start, (character) => character === ";");
}
/**
 * Reports whether a value is a reference to a variable declared deeper than the given depth,
 * so that storing it at that depth would let it outlive its variable.
 *
 * @param value - The value being stored or returned.
 * @param depth - The depth of the scope that will hold the value.
 * @returns True if the value is a reference that would outlive its target.
 */
export function escapes(value: Value, depth: number): boolean {
  if (typeof value !== "object") {
    return false;
  }
  const { target } = value;
  return target.depth > depth;
}
/**
 * Describes the kind of a value for error messages.
 *
 * @param value - The value to describe.
 * @returns "a number", "a boolean", or "a reference".
 */
export function kindOf(value: Value): string {
  if (typeof value === "number") {
    return "a number";
  }
  return typeof value === "boolean" ? "a boolean" : "a reference";
}
/**
 * Reports whether assignments must take no effect: inside a dead branch, or after a "break"
 * has run in the current loop iteration.
 *
 * @param cursor - The current parse state.
 * @returns True if effects are suppressed.
 */
export function isSuppressed(cursor: Cursor): boolean {
  return cursor.dead || cursor.exit !== undefined;
}
/**
 * Returns the exit set by a "break" and clears it, so the next loop iteration starts fresh.
 *
 * @param cursor - The parse state.
 * @returns The exit, or undefined if no break ran.
 */
export function takeExit(cursor: Cursor): LoopExit | undefined {
  const exit = cursor.exit;
  cursor.exit = undefined;
  return exit;
}