import { Value } from "./types";

type StructTypeDef = string[];
type VarTypeName = string | undefined;

import type { Parser } from "./parser";

const valueScopes = new WeakMap<Parser, Map<string, Value>[]>();
const structTypeScopes = new WeakMap<
  Parser,
  Map<string, StructTypeDef>[]
>();
const varTypeScopes = new WeakMap<Parser, Map<string, VarTypeName>[]>();

export function initScopes(parser: Parser): void {
  valueScopes.set(parser, []);
  structTypeScopes.set(parser, []);
  varTypeScopes.set(parser, []);
}

export function getValueScopes(parser: Parser): Map<string, Value>[] {
  const s = valueScopes.get(parser);
  if (s) return s;
  const arr: Map<string, Value>[] = [];
  valueScopes.set(parser, arr);
  return arr;
}

export function getStructTypeScopes(
  parser: Parser
): Map<string, StructTypeDef>[] {
  const s = structTypeScopes.get(parser);
  if (s) return s;
  const arr: Map<string, StructTypeDef>[] = [];
  structTypeScopes.set(parser, arr);
  return arr;
}

export function getVarTypeScopes(
  parser: Parser
): Map<string, VarTypeName>[] {
  const s = varTypeScopes.get(parser);
  if (s) return s;
  const arr: Map<string, VarTypeName>[] = [];
  varTypeScopes.set(parser, arr);
  return arr;
}
