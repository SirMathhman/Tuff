import type { ParamInfo } from "../parsing/param-helpers";

export type CompileFunctionDef = {
  params: ParamInfo[];
  generics?: string[];
};

/**
 * Store for function parameter type information collected during compilation
 */
const compileFunctionDefs = new Map<string, CompileFunctionDef>();

export function getCompileFunctionDefs(): Map<string, CompileFunctionDef> {
  return compileFunctionDefs;
}

export function setCompileFunctionDef(
  fnName: string,
  params: ParamInfo[],
  generics?: string[],
): void {
  compileFunctionDefs.set(fnName, { params, generics });
}

export function clearCompileFunctionDefs(): void {
  compileFunctionDefs.clear();
}
