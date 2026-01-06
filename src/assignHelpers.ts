import { Result, InterpretError, Value, ok } from "./types";
import { checkTypeConformance } from "./typeConformance";

export function tryInitialAssignment(
  initScopes: Map<string, boolean>[],
  scope: Map<string, Value>,
  name: string,
  value: Value
): Result<Value, InterpretError> | undefined {
  let kk = initScopes.length - 1;
  let foundInit = false;
  while (!foundInit && kk >= 0) {
    const is = initScopes[kk];
    if (is.has(name)) {
      const wasInitialized = Boolean(is.get(name));
      foundInit = true;
      if (!wasInitialized) {
        is.set(name, true);
        scope.set(name, value);
        return ok(value);
      }
    }
    kk--;
  }
  return undefined;
}

export function ensureVarMutable(
  mutScopes: Map<string, boolean>[],
  name: string
): InterpretError | undefined {
  let k = mutScopes.length - 1;
  let foundMut = false;
  while (!foundMut && k >= 0) {
    const ms = mutScopes[k];
    if (ms.has(name)) {
      const isMutable = ms.get(name);
      if (isMutable === false)
        return {
          type: "InvalidInput",
          message: "Cannot assign to immutable variable",
        };
      foundMut = true;
    }
    k--;
  }
  return undefined;
}

export function checkVarTypeConformance(
  vScopes: Map<string, string | undefined>[],
  name: string,
  value: Value,
  lookupType: (n: string) => string[] | undefined
): InterpretError | undefined {
  let j = vScopes.length - 1;
  let foundType = false;
  while (!foundType && j >= 0) {
    const vs = vScopes[j];
    if (vs.has(name)) {
      const typeName = vs.get(name);
      if (typeName) {
        const tcErr = checkTypeConformance(typeName, value, lookupType);
        if (tcErr) return tcErr;
      }
      foundType = true;
    }
    j--;
  }
  return undefined;
}
