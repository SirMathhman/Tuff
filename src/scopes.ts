import type { TuffStatement } from "./ast.ts";
import type { TuffValue } from "./values.ts";

/** A variable binding in a scope. */
export interface Binding {
  value: TuffValue;
  mut: boolean;
}

/** A registered function: its parameter names and body statements. */
export interface FnEntry {
  /** The parameter names, in source order. */
  params: string[];
  /** The function body statements. */
  body: TuffStatement[];
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

/** A registered reference: the binding it points at and its mutability. */
export interface RefEntry {
  binding: Binding;
  name: string;
  mut: boolean;
}

/** A per-evaluation registry mapping reference ids to their entries. */
export interface RefRegistry {
  next: number;
  refs: Map<number, RefEntry>;
}

/**
 * Create an empty reference registry.
 * @returns {RefRegistry} A fresh registry with no references.
 */
export function createRefRegistry(): RefRegistry {
  return { next: 1, refs: new Map() };
}

/** Per-evaluation state: the scope chain, reference registry, and functions. */
export interface Environment {
  scopes: Map<string, Binding>[];
  refs: RefRegistry;
  /** The registered functions, keyed by name. */
  fns: Map<string, FnEntry>;
}

/**
 * Create a fresh evaluation environment.
 * @returns {Environment} An environment with one empty scope, no references,
 * and no functions.
 */
export function createEnvironment(): Environment {
  return { scopes: [new Map()], refs: createRefRegistry(), fns: new Map() };
}
