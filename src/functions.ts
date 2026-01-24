import type { Interpreter } from "./expressions/handlers";
import { extractTypeSize } from "./type-utils";
import { makeDeclarationHandler } from "./declarations";
import { isValidIdentifier } from "./utils/identifier-utils";
type FnDef = {
  params: Array<{ name: string; type: number }>;
  returnType: number;
  body: string;
};
const functionDefs = new Map<string, FnDef>(),
  functionRefs = new Map<string, string>();
export const setFunctionRef = (varName: string, fnName: string) =>
  functionRefs.set(varName, fnName);
export const getFunctionRef = (varName: string) => functionRefs.get(varName);
export const isFunctionType = (typeStr: string) => {
  const t = typeStr.trim();
  return (
    t.startsWith("(") &&
    t.includes("=>") &&
    t.lastIndexOf(")") < t.indexOf("=>")
  );
};
export const handleFunctionDeclaration = makeDeclarationHandler(
  "fn",
  (rest: string) => {
    const arrowIndex = rest.indexOf("=>");
    return arrowIndex !== -1 ? rest.indexOf(";", arrowIndex) : -1;
  },
  (rest: string, closeIndex: number, typeMap: Map<string, number>) => {
    const parenStart = rest.indexOf("(");
    if (parenStart === -1) return;
    const parenEnd = rest.indexOf(")");
    if (parenEnd === -1) return;
    const fnName = rest.slice(0, parenStart).trim();
    if (!isValidIdentifier(fnName)) return;
    const paramsStr = rest.slice(parenStart + 1, parenEnd).trim(),
      params: Array<{ name: string; type: number }> = [];
    if (paramsStr) {
      const paramParts = paramsStr.split(",");
      for (const param of paramParts) {
        const colonIndex = param.indexOf(":");
        if (colonIndex === -1) return;
        const paramName = param.slice(0, colonIndex).trim(),
          paramTypeStr = param.slice(colonIndex + 1).trim();
        if (!isValidIdentifier(paramName)) return;
        let paramType = extractTypeSize(paramTypeStr);
        if (paramType === 0 && typeMap.has("__alias__" + paramTypeStr))
          paramType = typeMap.get("__alias__" + paramTypeStr) || 0;
        if (paramType === 0) return;
        params.push({ name: paramName, type: paramType });
      }
    }
    const arrowIndex = rest.indexOf("=>");
    if (arrowIndex === -1) return;
    const returnTypeStr = rest.slice(parenEnd + 1, arrowIndex).trim();
    if (!returnTypeStr.startsWith(":")) return;
    const returnTypeNameStr = returnTypeStr.slice(1).trim();
    let returnType = extractTypeSize(returnTypeNameStr);
    if (returnType === 0 && typeMap.has("__alias__" + returnTypeNameStr))
      returnType = typeMap.get("__alias__" + returnTypeNameStr) || 0;
    if (returnType === 0) return;
    const body = rest.slice(arrowIndex + 2, closeIndex).trim();
    functionDefs.set(fnName, { params, returnType, body });
  },
);

export function parseFunctionCall(
  s: string,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): number | undefined {
  const trimmed = s.trim();
  const parenIndex = trimmed.indexOf("(");
  if (parenIndex === -1) return undefined;
  const fnName = trimmed.slice(0, parenIndex).trim();
  if (!isValidIdentifier(fnName)) return undefined;
  const referencedFnName = getFunctionRef(fnName);
  const actualFnName = referencedFnName || fnName;
  if (!functionDefs.has(actualFnName)) return undefined;

  let parenDepth = 0,
    closeParenIndex = -1;
  for (let i = parenIndex; i < trimmed.length; i++) {
    if (trimmed[i] === "(") parenDepth++;
    else if (trimmed[i] === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        closeParenIndex = i;
        break;
      }
    }
  }
  if (closeParenIndex === -1) return undefined;

  const argsStr = trimmed.slice(parenIndex + 1, closeParenIndex).trim();
  const fnDef = functionDefs.get(actualFnName)!;
  const args: number[] = [];
  if (argsStr) {
    const argParts: string[] = [];
    let current = "",
      parenD = 0,
      braceD = 0;
    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      if (ch === "(") parenD++;
      else if (ch === ")") parenD--;
      else if (ch === "{") braceD++;
      else if (ch === "}") braceD--;
      else if (ch === "," && parenD === 0 && braceD === 0) {
        argParts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) argParts.push(current.trim());
    if (argParts.length !== fnDef.params.length)
      throw new Error(
        `function ${actualFnName} expects ${fnDef.params.length} arguments, got ${argParts.length}`,
      );
    for (const argStr of argParts)
      args.push(
        interpreter(
          argStr,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        ),
      );
  } else if (fnDef.params.length !== 0)
    throw new Error(
      `function ${actualFnName} expects ${fnDef.params.length} arguments, got 0`,
    );

  const fnScope = new Map<string, boolean>(mutMap),
    fnVarMap = new Map<string, number>();
  for (let i = 0; i < fnDef.params.length; i++) {
    const paramName = fnDef.params[i]?.name;
    const paramValue = args[i];
    if (paramName && paramValue !== undefined) {
      fnVarMap.set(paramName, paramValue);
      fnScope.set(paramName, false);
    }
  }
  const mergedScope = new Map(scope);
  for (const [k, v] of fnVarMap) mergedScope.set(k, v);
  const result = interpreter(
    fnDef.body,
    mergedScope,
    typeMap,
    fnScope,
    uninitializedSet,
    unmutUninitializedSet,
  );
  return result;
}
export function registerAnonymousFunction(
  lambdaExpr: string,
  typeMap: Map<string, number>,
  inferredReturnType?: number,
): string | undefined {
  const t = lambdaExpr.trim();
  if (!t.startsWith("(")) return undefined;
  const arrowIdx = t.indexOf("=>"),
    parenEnd = t.lastIndexOf(")", arrowIdx);
  if (arrowIdx === -1 || parenEnd === -1) return undefined;
  const paramsStr = t.slice(1, parenEnd).trim(),
    params: Array<{ name: string; type: number }> = [];
  if (paramsStr)
    for (const param of paramsStr.split(",")) {
      const colonIdx = param.indexOf(":"),
        pName = param.slice(0, colonIdx).trim(),
        pTypeStr = param.slice(colonIdx + 1).trim();
      if (colonIdx === -1 || !isValidIdentifier(pName)) return undefined;
      let pType = extractTypeSize(pTypeStr);
      if (pType === 0 && typeMap.has("__alias__" + pTypeStr))
        pType = typeMap.get("__alias__" + pTypeStr) || 0;
      if (pType === 0) return undefined;
      params.push({ name: pName, type: pType });
    }
  const rTypeStr = t.slice(parenEnd + 1, arrowIdx).trim();
  let rType = inferredReturnType || 0;
  if (rTypeStr.startsWith(":")) {
    const rTypeNameStr = rTypeStr.slice(1).trim();
    rType = extractTypeSize(rTypeNameStr);
    if (rType === 0 && typeMap.has("__alias__" + rTypeNameStr))
      rType = typeMap.get("__alias__" + rTypeNameStr) || 0;
  }
  if (rType === 0) return undefined;
  const anonName = `__anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  functionDefs.set(anonName, {
    params,
    returnType: rType,
    body: t.slice(arrowIdx + 2).trim(),
  });
  return anonName;
}
