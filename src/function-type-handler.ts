import { extractTypeSize } from "./type-utils";
import { registerAnonymousFunction, setFunctionRef } from "./functions";

type FunctionDefinition = {
  params: Array<{ name: string; type: number; typeStr?: string }>;
  returnType: number;
  body: string;
};

export function handleFunctionTypeAnnotation(
  typeStr: string,
  exprStr: string,
  varName: string,
  typeMap: Map<string, number>,
  functionDefs?: Map<string, FunctionDefinition>,
): { handled: boolean; vType: number } {
  if (!exprStr) return { handled: false, vType: 0 };
  let returnTypeSize = 0;
  const arrowIdx = typeStr.indexOf("=>");
  if (arrowIdx !== -1) {
    const returnTypeStr = typeStr.slice(arrowIdx + 2).trim();
    returnTypeSize =
      extractTypeSize(returnTypeStr) ||
      (typeMap.has("__alias__" + returnTypeStr)
        ? typeMap.get("__alias__" + returnTypeStr) || 0
        : 0);
  }
  let fnName = exprStr;
  if (exprStr.trim().startsWith("(")) {
    const anonResult = registerAnonymousFunction(
      exprStr,
      typeMap,
      returnTypeSize,
    );
    if (!anonResult) return { handled: false, vType: 0 };
    fnName = anonResult.name;
    if (functionDefs) {
      functionDefs.set(anonResult.name, anonResult.def);
    }
  }
  setFunctionRef(varName, fnName);
  return { handled: true, vType: -2 };
}
