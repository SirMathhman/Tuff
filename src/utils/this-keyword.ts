import { getCurrentFunctionParams } from "../functions";
import { createStructInstance } from "../types/structs";

// Special marker to indicate this is the global/module scope
export const GLOBAL_THIS_VALUE = -999999;

export function evaluateThisKeyword(scope: Map<string, number>): number {
  if (scope.has("this")) return scope.get("this")!;
  const p = getCurrentFunctionParams();
  if (p) {
    const fv = new Map();
    for (const x of p) fv.set(x.name, x.value);
    return createStructInstance("__fn_constructor__", fv);
  }
  // At global scope, return a special marker for global this
  return GLOBAL_THIS_VALUE;
}
