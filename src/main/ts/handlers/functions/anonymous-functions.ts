import { extractTypeSize } from "../../type-utils";
import { isValidIdentifier } from "../../utils/identifier-utils";
import { splitParametersRespectingParens } from "../../utils/function/function-utils";

export type AnonymousFnDef = {
  params: Array<{ name: string; type: number }>;
  returnType: number;
  body: string;
};

export function registerAnonymousFunction(
  lambdaExpr: string,
  typeMap: Map<string, number>,
  inferredReturnType?: number,
): { name: string; def: AnonymousFnDef } | undefined {
  const t = lambdaExpr.trim();
  if (!t.startsWith("(")) return undefined;
  const arrowIdx = t.indexOf("=>");
  if (arrowIdx === -1) return undefined;

  let parenEnd = -1;
  for (let i = arrowIdx - 1; i >= 0; i--) {
    if (t[i] === ")") {
      parenEnd = i;
      break;
    }
  }
  if (parenEnd === -1) return undefined;

  const paramsStr = t.slice(1, parenEnd).trim(),
    params: Array<{ name: string; type: number }> = [];
  if (paramsStr)
    for (const param of splitParametersRespectingParens(paramsStr)) {
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
  return {
    name: anonName,
    def: {
      params,
      returnType: rType,
      body: t.slice(arrowIdx + 2).trim(),
    },
  };
}
