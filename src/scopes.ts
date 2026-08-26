/** A variable binding in a scope. */
export interface Binding {
  value: number;
  mut: boolean;
}

/**
 * Find a binding by name, searching innermost scope first.
 * @param scopes {Map<string, Binding>[]} - The scope chain.
 * @param name {string} - The variable name to look up.
 * @returns {Binding | undefined} The binding, or undefined if not found.
 */
export function findBinding(
  scopes: Map<string, Binding>[],
  name: string,
): Binding | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const binding = scopes[i]?.get(name);
    if (binding) return binding;
  }
  return undefined;
}

/** A per-evaluation registry mapping reference ids to their bindings. */
export interface RefRegistry {
  next: number;
  refs: Map<number, Binding>;
}

/**
 * Create an empty reference registry.
 * @returns {RefRegistry} A fresh registry with no references.
 */
export function createRefRegistry(): RefRegistry {
  return { next: 1, refs: new Map() };
}

/** Per-evaluation state: the scope chain and the reference registry. */
export interface Environment {
  scopes: Map<string, Binding>[];
  refs: RefRegistry;
}

/**
 * Create a fresh evaluation environment.
 * @returns {Environment} An environment with one empty scope and no references.
 */
export function createEnvironment(): Environment {
  return { scopes: [new Map()], refs: createRefRegistry() };
}
