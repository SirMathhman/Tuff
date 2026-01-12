import type { Env } from "./types";
import {
  isIdentifierName,
  resolveTypeAlias,
  isIntegerTypeName,
  removeWhitespace,
  findMatchingParen,
  topLevelSplitTrim,
  inferTypeFromExpr,
  isObjectWithKey,
} from "./shared";

export function isFunctionValue(v: unknown): boolean {
  return isObjectWithKey(v, "params");
}

// Parse parameter type strings from a function signature like '(I32, Bool) => I32'
export function parseParamTypesFromSignature(
  sig: string | undefined
): string[] | undefined {
  if (!sig) return undefined;
  if (!sig.startsWith("(") || sig.indexOf("=>") === -1) return undefined;
  const close = findMatchingParen(sig, 0);
  if (close === -1) return undefined;
  const content = sig.slice(1, close).trim();
  if (content === "") return [];
  return topLevelSplitTrim(content, ",");
}

export function computeArgTypeFromExpr(
  expr: string,
  env?: Env
): string | undefined {
  const t = expr.trim();
  // identifier with a binding may have concrete type or numeric value
  if (isIdentifierName(t) && env && env.has(t)) {
    const item = env.get(t)!;
    if (item.type === "__deleted__") throw new Error("Unknown identifier");
    if (typeof item.value === "number") return item.type || "Number";
    if (isFunctionValue(item.value)) return item.type;
    if (typeof item.value === "object" && item.value !== null) return item.type;
    return item.type;
  }
  return inferTypeFromExpr(expr, env);
}

export function isTypeCompatible(
  paramType: string,
  argType: string | undefined,
  env?: Env
): boolean {
  // If we cannot infer the arg type, be permissive and accept (defer to runtime)
  if (!paramType) return true;
  if (!argType) return true;

  const resolvedParam = resolveTypeAlias(paramType, env);
  const resolvedArg = resolveTypeAlias(argType, env);

  // function-type: require exact match (ignore minor spacing differences)
  if (resolvedParam.startsWith("("))
    return (
      removeWhitespace(resolvedParam) === removeWhitespace(resolvedArg || "")
    );

  if (resolvedParam === "Bool") return resolvedArg === "Bool";

  // pointers
  if (resolvedParam.startsWith("*")) {
    if (!resolvedArg) return false;
    if (!resolvedArg.startsWith("*")) return false;
    return (
      resolveTypeAlias(resolvedParam.slice(1).trim(), env) ===
      resolveTypeAlias(resolvedArg.slice(1).trim(), env)
    );
  }

  // integer types vs generic Number
  if (isIntegerTypeName(resolvedParam) || resolvedParam === "Number") {
    if (resolvedArg === "Number") return true;
    if (isIntegerTypeName(resolvedArg)) return resolvedParam === resolvedArg;
    return false;
  }

  // fallback to equality
  return resolvedParam === resolvedArg;
}

interface TypedValue {
  type: string;
}

export function isValueCompatibleWithParam(
  val: unknown,
  paramType: string,
  env?: Env
): boolean {
  if (typeof val === "number")
    return isTypeCompatible(paramType, "Number", env);
  // if struct or object, we only support accepting matching declared types
  // check for .type property without using 'any'
  if (typeof val === "object" && val !== null && "type" in val) {
    const typedVal = val as unknown as TypedValue;
    if (typeof typedVal.type === "string") {
      return isTypeCompatible(paramType, typedVal.type, env);
    }
  }
  return true;
}
