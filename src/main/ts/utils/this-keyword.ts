import { getLocalFunctionNames } from "./scope-helpers";
import { createStructInstance } from "../types/structs";
import { currentFunctionParams } from "../function-defs";

// Special marker to indicate this is the global/module scope
export const GLOBAL_THIS_VALUE = -999999;

// Map from struct instance ID to set of available method names from local functions
const instanceMethodsMap = new Map<number, Set<string>>();
export const getInstanceMethods = (instanceId: number) =>
  instanceMethodsMap.get(instanceId);
export const setInstanceMethods = (instanceId: number, methods: Set<string>) =>
  instanceMethodsMap.set(instanceId, methods);

export function evaluateThisKeyword(scope: Map<string, number>): number {
  if (scope.has("this")) return scope.get("this")!;
  if (currentFunctionParams) {
    const fv = new Map();
    for (const x of currentFunctionParams) fv.set(x.name, x.value);

    const instanceId = createStructInstance("__fn_constructor__", fv);

    // Store locally-defined function names as available methods on this instance
    const localFns = getLocalFunctionNames();
    if (localFns && localFns.size > 0) {
      setInstanceMethods(instanceId, new Set(localFns));
    }

    return instanceId;
  }
  // At global scope, return a special marker for global this
  return GLOBAL_THIS_VALUE;
}
