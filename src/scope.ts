export interface Scope<V> {
  locals: Map<string, V>;
  outer: Scope<V> | undefined;
}

export function createScope<V>(outer: Scope<V> | undefined): Scope<V> {
  return { locals: new Map<string, V>(), outer };
}

export function lookup<V>(scope: Scope<V> | undefined, name: string): V | undefined {
  let current = scope;
  while (current !== undefined) {
    const value = current.locals.get(name);
    if (value !== undefined) return value;
    current = current.outer;
  }
  return undefined;
}
