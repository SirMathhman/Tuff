import { extractTypeSize } from "../type-utils";
import { makeDeclarationHandler } from "../declarations";
import { isValidIdentifier } from "../utils/identifier-utils";
import {
  isFunctionType,
  splitParametersRespectingParens,
  findClosingParenIndex,
} from "../utils/function-utils";

type FnDef = {
  params: Array<{ name: string; type: number; typeStr?: string }>;
  returnType: number;
  body: string;
};

export function createFunctionDeclarationHandler(
  functionDefs: Map<string, FnDef>,
) {
  return makeDeclarationHandler(
    "fn",
    (rest: string) => {
      const parenStart = rest.indexOf("(");
      if (parenStart === -1) return -1;
      const parenEnd = findClosingParenIndex(rest, parenStart);
      if (parenEnd === -1) return -1;
      const arrowIndex = rest.indexOf("=>", parenEnd);
      return arrowIndex !== -1 ? rest.indexOf(";", arrowIndex) : -1;
    },
    (rest: string, closeIndex: number, typeMap: Map<string, number>) => {
      const parenStart = rest.indexOf("(");
      if (parenStart === -1) return;
      const parenEnd = findClosingParenIndex(rest, parenStart);
      if (parenEnd === -1) return;

      const fnName = rest.slice(0, parenStart).trim();
      if (!isValidIdentifier(fnName)) return;
      const paramsStr = rest.slice(parenStart + 1, parenEnd).trim(),
        params: Array<{
          name: string;
          type: number;
          typeStr?: string;
        }> = [];
      if (paramsStr) {
        const paramParts = splitParametersRespectingParens(paramsStr);
        for (const param of paramParts) {
          const colonIndex = param.indexOf(":");
          if (colonIndex === -1) return;
          const paramName = param.slice(0, colonIndex).trim(),
            paramTypeStr = param.slice(colonIndex + 1).trim();
          if (!isValidIdentifier(paramName)) return;
          let paramType = extractTypeSize(paramTypeStr);
          if (paramType === 0 && typeMap.has("__alias__" + paramTypeStr))
            paramType = typeMap.get("__alias__" + paramTypeStr) || 0;
          if (paramType === 0 && isFunctionType(paramTypeStr)) {
            paramType = -2;
          }
          // Support struct types: use a unique marker for struct parameters
          if (paramType === 0 && typeMap.has("__struct__" + paramTypeStr)) {
            paramType = -3; // -3 indicates struct type
          }
          if (paramType === 0) return;
          params.push({
            name: paramName,
            type: paramType,
            typeStr: paramTypeStr,
          });
        }
      }

      const arrowIndex = rest.indexOf("=>", parenEnd);
      if (arrowIndex === -1) return;
      const returnTypeStr = rest.slice(parenEnd + 1, arrowIndex).trim();
      let returnType = 0;

      if (returnTypeStr.startsWith(":")) {
        const returnTypeNameStr = returnTypeStr.slice(1).trim();
        returnType = extractTypeSize(returnTypeNameStr);
        if (returnType === 0 && typeMap.has("__alias__" + returnTypeNameStr))
          returnType = typeMap.get("__alias__" + returnTypeNameStr) || 0;
      } else if (returnTypeStr === "") {
        returnType = 32;
      } else {
        return;
      }

      if (returnType === 0) return;
      const body = rest.slice(arrowIndex + 2, closeIndex).trim();
      functionDefs.set(fnName, { params, returnType, body });
    },
  );
}
