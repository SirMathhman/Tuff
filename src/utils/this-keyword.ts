import { getCurrentFunctionParams } from "../functions";
import { createStructInstance } from "../types/structs";

export function evaluateThisKeyword(
  scope: Map<string, number>,
): number {
  if (scope.has("this")) return scope.get("this")!;
  const p = getCurrentFunctionParams();
  if (p) {
    const fv = new Map();
    for (const x of p) fv.set(x.name, x.value);
    return createStructInstance("__fn_constructor__", fv);
  }
  throw new Error("'this' can only be used in function context");
}
