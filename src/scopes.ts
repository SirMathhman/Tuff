import { Value } from "./types";

type StructTypeDef = string[];
type VarTypeName = string | undefined;

export class ScopeKey {
  // A unique key object used to associate scope state with a parser instance.
  // Intentionally empty.
}

const valueScopes = new WeakMap<ScopeKey, Map<string, Value>[]>();
const structTypeScopes = new WeakMap<ScopeKey, Map<string, StructTypeDef>[]>();
const varTypeScopes = new WeakMap<ScopeKey, Map<string, VarTypeName>[]>();
const varMutabilityScopes = new WeakMap<ScopeKey, Map<string, boolean>[]>();
const varInitializedScopes = new WeakMap<ScopeKey, Map<string, boolean>[]>();

export function initScopes(key: ScopeKey): void {
  valueScopes.set(key, []);
  structTypeScopes.set(key, []);
  varTypeScopes.set(key, []);
  varMutabilityScopes.set(key, []);
  varInitializedScopes.set(key, []);
}

export function getValueScopes(key: ScopeKey): Map<string, Value>[] {
  const s = valueScopes.get(key);
  if (s) return s;
  const arr: Map<string, Value>[] = [];
  valueScopes.set(key, arr);
  return arr;
}

export function getVarMutabilityScopes(key: ScopeKey): Map<string, boolean>[] {
  const s = varMutabilityScopes.get(key);
  if (s) return s;
  const arr: Map<string, boolean>[] = [];
  varMutabilityScopes.set(key, arr);
  return arr;
}

export function getVarInitializedScopes(key: ScopeKey): Map<string, boolean>[] {
  const s = varInitializedScopes.get(key);
  if (s) return s;
  const arr: Map<string, boolean>[] = [];
  varInitializedScopes.set(key, arr);
  return arr;
}

export function getStructTypeScopes(
  key: ScopeKey
): Map<string, StructTypeDef>[] {
  const s = structTypeScopes.get(key);
  if (s) return s;
  const arr: Map<string, StructTypeDef>[] = [];
  structTypeScopes.set(key, arr);
  return arr;
}

export function getVarTypeScopes(key: ScopeKey): Map<string, VarTypeName>[] {
  const s = varTypeScopes.get(key);
  if (s) return s;
  const arr: Map<string, VarTypeName>[] = [];
  varTypeScopes.set(key, arr);
  return arr;
}
