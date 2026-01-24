import { extractTypeSize } from "./type-utils";
import { registerAnonymousFunction, setFunctionRef } from "./functions";

export function handleFunctionTypeAnnotation(
  typeStr: string,
  exprStr: string,
  varName: string,
  typeMap: Map<string, number>,
): { handled: boolean; vType: number } {
  if (!exprStr) return { handled: false, vType: 0 };
  let returnTypeSize = 0;
  const arrowIdx = typeStr.indexOf("=>");
  if (arrowIdx !== -1) {
    const returnTypeStr = typeStr.slice(arrowIdx + 2).trim();
    returnTypeSize = extractTypeSize(returnTypeStr) || (typeMap.has("__alias__" + returnTypeStr) ? typeMap.get("__alias__" + returnTypeStr) || 0 : 0);
  }
  let fnName = exprStr;
  if (exprStr.trim().startsWith("(")) {
    const anonName = registerAnonymousFunction(exprStr, typeMap, returnTypeSize);
    if (!anonName) return { handled: false, vType: 0 };
    fnName = anonName;
  }
  setFunctionRef(varName, fnName);
  return { handled: true, vType: -2 };
}
