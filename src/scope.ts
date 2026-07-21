import type {
  Expr,
  FunctionParam,
  StructField,
  StructValue,
  RefValue,
} from "./ast";

export interface FunctionInfo {
  body: Expr;
  params: FunctionParam[];
}

export type Scope = {
  env: Record<string, number | StructValue | RefValue>;
  mutable: Set<string>;
  types: Record<string, string | null>;
  functions: Record<string, FunctionInfo>;
  functionReturnTypes: Record<string, string | null>;
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
): number | StructValue | RefValue | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return scopes[i]!.env[name];
  }
  return undefined;
}
