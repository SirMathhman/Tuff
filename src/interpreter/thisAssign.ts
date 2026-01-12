import type { Env, EnvItem } from "./types";
import { isIdentifierName, inferTypeFromExpr } from "./shared";

export function assertAssignable(cur: EnvItem, rhsType: string | undefined) {
  if (!cur.mutable && typeof cur.value === "number" && !Number.isNaN(cur.value))
    throw new Error("Cannot assign to immutable variable");
  if (cur.type) {
    const first = cur.type[0];
    if (first && "IiUu".includes(first)) {
      if (rhsType === "Bool")
        throw new Error("Type mismatch: cannot assign Bool to integer type");
    }
    if (cur.type === "Bool") {
      if (rhsType !== "Bool")
        throw new Error("Type mismatch: cannot assign non-Bool to Bool");
    }
  }
}

export function tryHandleThisAssignment(
  stmt: string,
  env: Env,
  interpret: (input: string, env?: Env) => unknown
): number | undefined {
  const trimmed = stmt.trim();
  if (!trimmed.startsWith("this.")) return undefined;
  const rest = trimmed.slice(5);
  const eqIdx = rest.indexOf("=");
  if (eqIdx === -1) return undefined;
  const name = rest.slice(0, eqIdx).trim();
  if (!isIdentifierName(name)) return undefined;
  const rhs = rest.slice(eqIdx + 1).trim();
  if (rhs === "") throw new Error("Invalid assignment");
  if (!env.has(name)) throw new Error("Unknown identifier");
  const cur = env.get(name)!;
  assertAssignable(cur, inferTypeFromExpr(rhs, env));
  const val = interpret(rhs, env);
  if (typeof val !== "number")
    throw new Error("Assigned value must be a number");
  cur.value = val as number;
  env.set(name, cur);
  return val as number;
}
