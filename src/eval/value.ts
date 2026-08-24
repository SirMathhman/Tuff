import { err, ErrorKind } from "../errors.ts";
import type { EvalError, Position } from "../errors.ts";
import { Err, Ok } from "../result.ts";
import type { Result } from "../result.ts";
import type { FnInfo } from "../ast/index.ts";

export enum ValueKind {
  Number = "number",
  Boolean = "boolean",
  Ref = "ref",
  Array = "array",
  Fn = "fn",
}

export interface NumberValue {
  readonly kind: ValueKind.Number;
  readonly value: number;
}

export interface BooleanValue {
  readonly kind: ValueKind.Boolean;
  readonly value: boolean;
}

export interface RefValue {
  readonly kind: ValueKind.Ref;
  readonly target: string;
  readonly mutable: boolean;
}

export interface ArrayValue {
  readonly kind: ValueKind.Array;
  readonly elements: readonly Value[];
}

export interface FnValue extends FnInfo {
  readonly kind: ValueKind.Fn;
}

export type Value = NumberValue | BooleanValue | RefValue | ArrayValue | FnValue;

export interface ResolvedTarget {
  readonly name: string;
  readonly binding: Binding;
}

export interface Binding {
  value: Value;
  mutable: boolean;
  /** Known numeric literal (static pass only); invalidated on reassignment. */
  literal?: number;
  /** Integer type (suffix or annotation) the binding is declared with. */
  intType?: string;
}

export function resolveRefChain(
  name: string,
  get: (name: string) => Binding | undefined,
): ResolvedTarget | null {
  const visited = new Set<string>();
  let currentName = name;
  let current = get(currentName);
  while (current && current.value.kind === ValueKind.Ref) {
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
): Result<ResolvedTarget, EvalError> {
  if (refBinding.value.kind !== ValueKind.Ref) {
    return Err(err(ErrorKind.Semantic, `"${name}" is not a reference`, position));
  }
  if (!refBinding.value.mutable) {
    return Err(
      err(ErrorKind.Mutability, `Cannot assign through immutable reference "${name}"`, position),
    );
  }
  const resolved = resolveRefChain(name, get);
  if (!resolved) {
    return Err(err(ErrorKind.Runtime, `Reference target "${name}" is undefined`, position));
  }
  return Ok(resolved);
}
