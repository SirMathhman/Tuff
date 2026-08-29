import type { Value } from "./ast.ts";

/**
 * A single lexical scope holding bindings.
 */
export interface Scope {
  /** The values bound in this scope. */
  values: Record<string, Value>;
  /** Whether each bound name is mutable. */
  mutable: Record<string, boolean>;
  /** The enclosing scope, or null at the root. */
  parent: Scope | null;
}

/**
 * A variable environment: a chain of lexical scopes, innermost first.
 */
export interface Env {
  /** The innermost scope. */
  scope: Scope;
}

/**
 * A snapshot of a single scope's bindings.
 */
interface ScopeSnapshot {
  /** The values bound in the scope. */
  values: Record<string, Value>;
  /** Whether each bound name is mutable. */
  mutable: Record<string, boolean>;
}

/**
 * Look up a name in the scope chain, innermost first.
 * @param {Scope} scope - The innermost scope to start from.
 * @param {string} name - The name to look up.
 * @returns {Value | undefined} The bound value, or undefined when unbound.
 */
export function lookup(scope: Scope, name: string): Value | undefined {
  let cur: Scope | null = scope;
  while (cur !== null) {
    const value = cur.values[name];
    if (value !== undefined) {
      return value;
    }
    cur = cur.parent;
  }
  return undefined;
}

/**
 * Find the nearest scope in the chain that binds a name.
 * @param {Scope} scope - The innermost scope to start from.
 * @param {string} name - The name to locate.
 * @returns {Scope | null} The binding scope, or null when unbound.
 */
export function findScope(scope: Scope, name: string): Scope | null {
  let cur: Scope | null = scope;
  while (cur !== null) {
    if (cur.values[name] !== undefined) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * Snapshot every scope in the chain, innermost first.
 * @param {Scope} scope - The innermost scope.
 * @returns {ScopeSnapshot[]} A snapshot per scope, innermost first.
 */
export function snapshotChain(scope: Scope): ScopeSnapshot[] {
  const snaps: ScopeSnapshot[] = [];
  for (let cur: Scope | null = scope; cur !== null; cur = cur.parent) {
    snaps.push({ values: { ...cur.values }, mutable: { ...cur.mutable } });
  }
  return snaps;
}

/**
 * Restore a scope chain from snapshots taken by snapshotChain.
 * @param {Scope} scope - The innermost scope.
 * @param {ScopeSnapshot[]} snaps - The snapshots, innermost first.
 * @returns {void} Nothing.
 */
export function restoreChain(scope: Scope, snaps: ScopeSnapshot[]): void {
  let cur: Scope | null = scope;
  for (const snap of snaps) {
    cur!.values = snap.values;
    cur!.mutable = snap.mutable;
    cur = cur!.parent;
  }
}

/**
 * Whether a name is bound mutable in a block's local scope.
 * @param {Record<string, boolean>} mutable - The block's mutability map.
 * @param {string} name - The name to test.
 * @returns {boolean} True when the name is bound and mutable.
 */
export function isMutable(
  mutable: Record<string, boolean>,
  name: string,
): boolean {
  return mutable[name] === true;
}
