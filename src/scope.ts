import type {
  Expr,
  FunctionParam,
  StructField,
  StructValue,
  RefValue,
  ArrayValue,
} from "./ast";
import type { Type } from "./types";

export interface FunctionInfo {
  body: Expr;
  params: FunctionParam[];
}

export type Scope = {
  env: Record<string, number | StructValue | RefValue | ArrayValue>;
  mutable: Set<string>;
  types: Record<string, Type | null>;
  functions: Record<string, FunctionInfo>;
  functionReturnTypes: Record<string, Type | null>;
  structs: Record<string, StructField[]>;
};

export function createScope(): Scope {
  return {
    env: {},
    mutable: new Set(),
    types: {},
    functions: {},
    functionReturnTypes: {},
    structs: {},
  };
}

export function lookup(name: string, scopes: Scope[]): boolean {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return true;
  }
  return false;
}

export function findScope(name: string, scopes: Scope[]): Scope | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return scopes[i]!;
  }
  return null;
}

export function lookupValue(
  name: string,
  scopes: Scope[],
): number | StructValue | RefValue | ArrayValue | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return scopes[i]!.env[name];
  }
  return undefined;
}
