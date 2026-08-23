import { err } from "./errors.ts";
import type { EvalError, Position } from "./errors.ts";
import { Err, Ok } from "./result.ts";
import type { Result } from "./result.ts";

export type Value =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "ref"; readonly target: string; readonly mutable: boolean }
  | { readonly kind: "array"; readonly elements: readonly Value[] }
  | { readonly kind: "unknown" };

export interface Binding {
  value: Value;
  mutable: boolean;
  /** Known numeric literal (static pass only); invalidated on reassignment. */
  literal?: number;
  /** Static pass could not determine the value's kind. */
  unknown?: boolean;
}

export function resolveRefChain(
  name: string,
  get: (name: string) => Binding | undefined,
): { name: string; binding: Binding } | null {
  const visited = new Set<string>();
  let currentName = name;
  let current = get(currentName);
  while (current && current.value.kind === "ref") {
    currentName = current.value.target;
    if (visited.has(currentName)) return null;
    visited.add(currentName);
    const next = get(currentName);
    if (!next) return null;
    current = next;
  }
  return current ? { name: currentName, binding: current } : null;
}

export function validateDerefBinding(
  refBinding: Binding,
  name: string,
  get: (name: string) => Binding | undefined,
  position: Position,
): Result<{ name: string; binding: Binding }, EvalError> {
  if (refBinding.value.kind !== "ref") {
    return Err(err("semantic", `"${name}" is not a reference`, position));
  }
  if (!refBinding.value.mutable) {
    return Err(err("mutability", `Cannot assign through immutable reference "${name}"`, position));
  }
  const resolved = resolveRefChain(name, get);
  if (!resolved) {
    return Err(err("runtime", `Reference target "${name}" is undefined`, position));
  }
  return Ok(resolved);
}
