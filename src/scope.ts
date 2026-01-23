import { extractTypedInfo } from "./parser";
import { extractTypeSize } from "./types";

type Interpreter = (
  input: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
) => number;

export function handleVarDecl(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): number | undefined {
  if (s.indexOf("let ") !== 0) return undefined;
  const semiIndex = s.indexOf(";");
  if (semiIndex === -1) return undefined;
  const isMut = s.indexOf("mut ") !== -1,
    declStr = s.slice(0, semiIndex),
    eqIndex = declStr.indexOf("=");
  if (eqIndex === -1) return undefined;
  const varPart = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim(),
    colonIndex = varPart.indexOf(":");
  const varName =
    colonIndex !== -1 ? varPart.slice(0, colonIndex).trim() : varPart;
  if (scope.has(varName))
    throw new Error(`variable '${varName}' already declared`);
  const exprStr = declStr.slice(eqIndex + 1).trim(),
    varValue = interpreter(exprStr, scope, typeMap, mutMap);
  const vType =
    extractTypedInfo(exprStr).typeSize ||
    (scope.has(exprStr) ? typeMap.get(exprStr) || 0 : 0);
  if (colonIndex !== -1 && vType > 0) {
    const dType = extractTypeSize(varPart.slice(colonIndex + 1).trim());
    if (dType > 0 && vType > dType)
      throw new Error(`bad type: ${vType} to U${dType}`);
  }
  scope.set(varName, varValue);
  if (vType > 0) typeMap.set(varName, vType);
  if (isMut) mutMap.set(varName, true);
  return interpreter(
    s.slice(semiIndex + 1).trim(),
    scope,
    typeMap,
    mutMap,
  );
}

export function findMatchingClose(
  s: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): number {
  let depth = 0;
  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i];
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function evaluateGroupedExpressionsWithScope(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): string {
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["{", "}"],
    ["[", "]"],
  ];
  for (const [openChar, closeChar] of pairs) {
    const openIndex = s.indexOf(openChar);
    if (openIndex === -1) continue;
    const closeIndex = findMatchingClose(s, openIndex, openChar, closeChar);
    if (closeIndex === -1) throw new Error(`unmatched opening ${openChar}`);
    const inside = s.slice(openIndex + 1, closeIndex);
    const cScope = new Map(scope),
      cTypeMap = new Map(typeMap),
      cMutMap = new Map(mutMap);
    const result = interpreter(inside, cScope, cTypeMap, cMutMap);
    if (openChar === "{") {
      for (const [k, v] of cScope.entries()) if (scope.has(k)) scope.set(k, v);
      for (const [k, v] of cMutMap.entries())
        if (mutMap.has(k)) mutMap.set(k, v);
    }
    const after = s.slice(closeIndex + 1).trim();
    if (
      openChar === "{" &&
      inside.includes("=") &&
      after &&
      !after.includes("+") &&
      !after.includes("-") &&
      !after.includes("*") &&
      !after.includes("/")
    ) {
      return evaluateGroupedExpressionsWithScope(
        s.slice(0, openIndex) + after,
        scope,
        typeMap,
        mutMap,
        interpreter,
      );
    }
    return evaluateGroupedExpressionsWithScope(
      s.slice(0, openIndex) + String(result) + s.slice(closeIndex + 1),
      scope,
      typeMap,
      mutMap,
      interpreter,
    );
  }
  return s;
}
