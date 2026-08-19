/** A stack of variable scopes, innermost last. */
export type ScopeStack<T> = Map<string, T>[];

/** Find a binding by walking the scopes from innermost outward. */
export function lookup<T>(scopes: ScopeStack<T>, name: string): T | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const binding = scopes[i].get(name);
    if (binding) {
      return binding;
    }
  }
  return undefined;
}

/**
 * Run `body` inside a fresh scope, guaranteeing the scope is popped even if
 * `body` throws or returns early — a forgotten pop is structurally impossible.
 */
export function withScope<T, R>(scopes: ScopeStack<T>, body: () => R): R {
  scopes.push(new Map());
  try {
    return body();
  } finally {
    scopes.pop();
  }
}
