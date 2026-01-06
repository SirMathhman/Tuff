import { Value } from "./types";

type StructTypeDef = string[];
type VarTypeName = string | undefined;

const valueScopes = new WeakMap<object, Map<string, Value>[]>();
const structTypeScopes = new WeakMap<object, Map<string, StructTypeDef>[]>();
const varTypeScopes = new WeakMap<object, Map<string, VarTypeName>[]>();

export function initScopes(parser: object): void {
  valueScopes.set(parser, []);
  structTypeScopes.set(parser, []);
  varTypeScopes.set(parser, []);
}

export function getValueScopes(parser: object): Map<string, Value>[] {
  const s = valueScopes.get(parser);
  if (s) return s;
  const arr: Map<string, Value>[] = [];
  valueScopes.set(parser, arr);
  return arr;
}

export function getStructTypeScopes(
  parser: object
): Map<string, StructTypeDef>[] {
  const s = structTypeScopes.get(parser);
  if (s) return s;
  const arr: Map<string, StructTypeDef>[] = [];
  structTypeScopes.set(parser, arr);
  return arr;
}

export function getVarTypeScopes(
  parser: object
): Map<string, VarTypeName>[] {
  const s = varTypeScopes.get(parser);
  if (s) return s;
  const arr: Map<string, VarTypeName>[] = [];
  varTypeScopes.set(parser, arr);
  return arr;
}
