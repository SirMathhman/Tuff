import { extractTypeSize } from "../type-utils";
import { makeDeclarationHandler } from "../declarations";
import { isValidIdentifier } from "../utils/identifier-utils";
import {
  isFunctionType,
  splitParametersRespectingParens,
  findClosingParenIndex,
} from "../utils/function-utils";
import { addLocalFunctionName } from "../utils/scope-helpers";

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function parseGenericParams(s: string): { name: string; params: string[] } {
  const angleStart = s.indexOf("<");
  if (angleStart === -1) return { name: s.trim(), params: [] };
  const angleEnd = s.indexOf(">");
  if (angleEnd === -1) return { name: s.trim(), params: [] };
  const name = s.slice(0, angleStart).trim();
  const paramStr = s.slice(angleStart + 1, angleEnd).trim();
  const params = paramStr.split(",").map((p) => p.trim());
  return { name, params };
}

type FnDef = {
  params: Array<{ name: string; type: number; typeStr?: string }>;
  returnType: number;
  body: string;
  generics?: string[];
};

export function createFunctionDeclarationHandler(
  functionDefs: Map<string, FnDef>,
) {
  return makeDeclarationHandler(
    "fn",
    (rest: string) => {
      // Extract function name/generics and find where they end
      const angleStart = rest.indexOf("<");
      let headerEnd = angleStart;
      if (angleStart !== -1) {
        // There are generics, find the closing `>`
        headerEnd = rest.indexOf(">", angleStart);
        if (headerEnd === -1) return -1;
      } else {
        // No generics, find where the function name ends (at `(`)
        headerEnd = rest.indexOf("(") - 1;
        if (headerEnd < 0) return -1;
      }
      // Find parameter list starting from after the function header
      const parenStart = rest.indexOf("(", headerEnd);
      if (parenStart === -1) return -1;
      const parenEnd = findClosingParenIndex(rest, parenStart);
      if (parenEnd === -1) return -1;
      const arrowIndex = rest.indexOf("=>", parenEnd);
      if (arrowIndex === -1) return -1;

      // Check if body is brace-enclosed
      let bodyStart = arrowIndex + 2;
      while (bodyStart < rest.length && isWhitespace(rest[bodyStart]!))
        bodyStart++;
      if (bodyStart < rest.length && rest[bodyStart] === "{") {
        // Find matching }
        let braceDepth = 0;
        for (let i = bodyStart; i < rest.length; i++) {
          if (rest[i] === "{") braceDepth++;
          else if (rest[i] === "}") {
            braceDepth--;
            if (braceDepth === 0) {
              // Found the closing brace, now look for semicolon after it
              let semiIndex = i + 1;
              while (semiIndex < rest.length && isWhitespace(rest[semiIndex]!))
                semiIndex++;
              return semiIndex < rest.length && rest[semiIndex] === ";"
                ? semiIndex
                : -1;
            }
          }
        }
        return -1; // Unmatched brace
      }

      // Body is not brace-enclosed, look for semicolon after =>
      return rest.indexOf(";", arrowIndex);
    },
    (
      rest: string,
      closeIndex: number,
      typeMap: Map<string, number>,
      visMap: Map<string, boolean>,
      isPublic: boolean,
    ) => {
      // Extract function name/generics and find where they end
      const angleStart = rest.indexOf("<");
      let fnHeaderStr: string;
      let parenStart: number;

      if (angleStart !== -1) {
        // There are generics
        const angleEnd = rest.indexOf(">", angleStart);
        if (angleEnd === -1) return;
        fnHeaderStr = rest.slice(0, angleEnd + 1).trim();
        parenStart = rest.indexOf("(", angleEnd);
        if (parenStart === -1) return;
      } else {
        // No generics
        parenStart = rest.indexOf("(");
        if (parenStart === -1) return;
        fnHeaderStr = rest.slice(0, parenStart).trim();
      }

      const parenEnd = findClosingParenIndex(rest, parenStart);
      if (parenEnd === -1) return;

      const { name: fnName, params: genericParams } =
        parseGenericParams(fnHeaderStr);
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
          // If paramType is still 0, it might be a generic type parameter or unknown type
          // For now, allow unknown types to be treated as generics
          if (paramType === 0) {
            paramType = 32; // Default to I32 for unknown/generic types
          }
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
      const fnDef: FnDef = { params, returnType, body };
      if (genericParams.length > 0) {
        fnDef.generics = genericParams;
      }
      functionDefs.set(fnName, fnDef);
      // Track visibility
      visMap.set(fnName, isPublic);
      // Track this function as a local function in the current execution scope
      addLocalFunctionName(fnName);
    },
  );
}
