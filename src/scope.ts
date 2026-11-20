/** The bindings of one block, linked to the enclosing block's scope. */
export interface Scope<V> {
  /** The names bound directly in this block. */
  locals: Map<string, V>;
  /** The enclosing scope, or `undefined` at the top level. */
  outer: Scope<V> | undefined;
}

/**
 * Creates an empty scope nested in `outer`.
 *
 * @param outer - The enclosing scope, or `undefined` at the top level.
 * @returns A new scope with no bindings.
 */
export function createScope<V>(outer: Scope<V> | undefined): Scope<V> {
  return { locals: new Map<string, V>(), outer };
}

/**
 * Finds a name, searching the innermost scope first.
 *
 * @param scope - The scope to search, or `undefined` for none.
 * @param name - The name to find.
 * @returns The bound value, or `undefined` if no enclosing scope binds `name`.
 */
export function lookup<V>(scope: Scope<V> | undefined, name: string): V | undefined {
  let current = scope;
  while (current !== undefined) {
    const value = current.locals.get(name);
    if (value !== undefined) return value;
    current = current.outer;
  }
  return undefined;
}
