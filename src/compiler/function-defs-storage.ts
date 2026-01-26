import type { ParamInfo } from "./parsing/param-helpers";

/**
 * Store for function parameter type information collected during compilation
 */
const compileFunctionDefs = new Map<string, ParamInfo[]>();

export function getCompileFunctionDefs(): Map<string, ParamInfo[]> {
  return compileFunctionDefs;
}

export function setCompileFunctionDef(
  fnName: string,
  params: ParamInfo[],
): void {
  compileFunctionDefs.set(fnName, params);
}

export function clearCompileFunctionDefs(): void {
  compileFunctionDefs.clear();
}
