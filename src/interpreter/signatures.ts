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
export function parseGenericParamsFromSignature(
  sig: string | undefined
): string[] | undefined {
  if (!sig) return undefined;
  const str = sig.trim();
  if (!str.startsWith("<")) return undefined;
  const close = str.indexOf(">");
  if (close === -1) return undefined;
  const content = str.slice(1, close).trim();
  if (content === "") return [];
  return content.split(",").map((p) => p.trim());
}

export function parseParamTypesFromSignature(
  sig: string | undefined
): string[] | undefined {
  if (!sig) return undefined;
  let s = sig.trim();
  // Skip optional leading generics: <T, U>
  if (s.startsWith("<")) {
    const close = s.indexOf(">");
    if (close === -1) return undefined;
    s = s.slice(close + 1).trim();
  }
  if (!s.startsWith("(") || s.indexOf("=>") === -1) return undefined;
  const close = findMatchingParen(s, 0);
  if (close === -1) return undefined;
  const content = s.slice(1, close).trim();
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

// Substitute generic type parameters (e.g., T -> I32) in a type string.
export function substituteGenericTypes(
  typeStr: string,
  map: Map<string, string>
): string {
  const s = typeStr.trim();

  // pointer: *T or *mut T
  if (s.startsWith("*")) {
    const inner = s.slice(1).trim();
    return `*${substituteGenericTypes(inner, map)}`;
  }

  // function type: (A, B) => R
  if (s.startsWith("(")) {
    const close = findMatchingParen(s, 0);
    if (close === -1) return s;
    const params = s.slice(1, close).trim();
    const rest = s.slice(close + 1).trim();
    if (!rest.startsWith("=>")) return s;
    const paramParts = params === "" ? [] : topLevelSplitTrim(params, ",");
    const subParams = paramParts.map((p) => substituteGenericTypes(p, map));
    const ret = substituteGenericTypes(rest.slice(2).trim(), map);
    return `(${subParams.join(", ")}) => ${ret}`;
  }

  // array type: [Elem; Init; Len]
  if (s.startsWith("[")) {
    const inner = s.slice(1, -1).trim();
    const parts = topLevelSplitTrim(inner, ";");
    if (parts.length === 3) {
      const elem = substituteGenericTypes(parts[0].trim(), map);
      return `[${elem}; ${parts[1].trim()}; ${parts[2].trim()}]`;
    }
    return s;
  }

  // bare identifier - replace if in map
  if (isIdentifierName(s) && map.has(s)) return map.get(s)!;
  return s;
}

// Infer generic bindings from a single parameter type and the corresponding
// argument type string (which may be undefined). Updates the `out` map or
// throws on conflicting/invalid inferences.
function inferPair(p: string, a: string, generics: string[], out: Map<string, string>) {
  inferBindingsFromPair(p, a, generics, out);
}

function inferTrimmedPair(prefix: number, p: string, a: string, generics: string[], out: Map<string, string>) {
  inferPair(p.slice(prefix).trim(), a.slice(prefix).trim(), generics, out);
}

function handleFunctionBindings(
  p: string,
  a: string,
  generics: string[],
  out: Map<string, string>
) {
  const pClose = findMatchingParen(p, 0);
  const aClose = findMatchingParen(a, 0);
  if (pClose === -1 || aClose === -1) return;
  const pParams = p.slice(1, pClose).trim();
  const aParams = a.slice(1, aClose).trim();
  const pParts = pParams === "" ? [] : topLevelSplitTrim(pParams, ",");
  const aParts = aParams === "" ? [] : topLevelSplitTrim(aParams, ",");
  if (pParts.length !== aParts.length) return;
  for (let i = 0; i < pParts.length; i++) inferPair(pParts[i], aParts[i], generics, out);
  const pRet = p.slice(pClose + 1).trim();
  const aRet = a.slice(aClose + 1).trim();
  if (pRet.startsWith("=>") && aRet.startsWith("=>"))
    inferTrimmedPair(2, pRet, aRet, generics, out);
}

function inferBindingsFromPair(
  paramType: string,
  argType: string | undefined,
  generics: string[],
  out: Map<string, string>
) {
  if (!argType) return; // cannot infer
  const p = paramType.trim();
  const a = argType.trim();

  // pointer case
  if (p.startsWith("*") && a.startsWith("*")) {
    return inferPair(p.slice(1).trim(), a.slice(1).trim(), generics, out);
  }

  // function case
  if (p.startsWith("(") && a.startsWith("(")) {
    return handleFunctionBindings(p, a, generics, out);
  }

  // array case
  if (p.startsWith("[") && a.startsWith("[")) {
    const pInner = p.slice(1, -1).trim();
    const aInner = a.slice(1, -1).trim();
    handleArrayBindings(pInner, aInner, generics, out);
    return;
  }

  // bare identifier case - if it's a generic name, bind it
  if (isIdentifierName(p) && generics.includes(p)) {
    // If already bound, ensure same - allow 'Number' to be compatible with concrete integer binding
    if (out.has(p)) {
      const existing = out.get(p)!;
      if (existing === a) return;
      if (a === "Number") return; // numeric literal - accept existing concrete binding
      if (existing === "Number") {
        out.set(p, a);
        return;
      }
      throw new Error("Argument type mismatch");
    }
    out.set(p, a);
    return;
  }

  // otherwise no generics here; nothing to infer
  return;
}

function handleArrayBindings(
  pInner: string,
  aInner: string,
  generics: string[],
  out: Map<string, string>
) {
  const pParts = topLevelSplitTrim(pInner, ";");
  const aParts = topLevelSplitTrim(aInner, ";");
  if (pParts.length === 3 && aParts.length === 3)
    return inferBindingsFromPair(pParts[0].trim(), aParts[0].trim(), generics, out);
}

export function inferGenericBindingsForCall(
  paramTypes: string[] | undefined,
  argExprs: string[],
  genericParams: string[] | undefined,
  env?: Env
): Map<string, string> {
  const out = new Map<string, string>();
  if (!paramTypes || !genericParams || genericParams.length === 0) return out;
  for (let i = 0; i < paramTypes.length; i++) {
    const pt = paramTypes[i];
    const argExpr = argExprs[i];
    const aType = computeArgTypeFromExpr(argExpr, env);
    inferBindingsFromPair(pt, aType, genericParams, out);
  }
  return out;
}

export function computeConcreteParamTypes(
  signature: string | undefined,
  paramTypesLocal: string[] | undefined,
  argsLocal: string[],
  env?: Env
): string[] | undefined {
  const genericParamsLocal = parseGenericParamsFromSignature(signature);
  if (paramTypesLocal && genericParamsLocal && genericParamsLocal.length > 0) {
    const bindingsMapLocal = inferGenericBindingsForCall(
      paramTypesLocal,
      argsLocal,
      genericParamsLocal,
      env
    );
    return paramTypesLocal.map((pt) => substituteGenericTypes(pt, bindingsMapLocal));
  }
  return paramTypesLocal;
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
