import { extractTypedInfo } from "../parser";
import { extractTypeSize } from "../type-utils";
import { isFunctionType } from "./function-utils";

export function findSemicolonIndex(s: string): number {
  let semiIndex = -1;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    else if (
      ch === ";" &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      semiIndex = i;
      break;
    }
  }
  return semiIndex;
}

export function findEqualIndex(declStr: string): number {
  let eqIndex = -1;
  for (let i = 0; i < declStr.length; i++) {
    if (
      declStr[i] === "=" &&
      (i + 1 >= declStr.length || declStr[i + 1] !== ">") &&
      (i === 0 || declStr[i - 1] !== "=")
    ) {
      eqIndex = i;
      break;
    }
  }
  return eqIndex;
}

export function extractTypeFromAnnotation(
  typeStr: string,
  typeMap: Map<string, number>,
): number {
  let vType = extractTypeSize(typeStr);
  if (vType === 0 && typeMap.has("__alias__" + typeStr))
    vType = typeMap.get("__alias__" + typeStr) || 0;
  return vType;
}

export function extractAndValidateType(
  exprStr: string,
  declaredType: string | undefined,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
): { vType: number; isUnion: boolean } {
  let vType =
    extractTypedInfo(exprStr).typeSize ||
    (scope.has(exprStr) ? typeMap.get(exprStr) || 0 : 0);
  let isUnion = false;

  if (declaredType) {
    if (isFunctionType(declaredType)) {
      return { vType: -2, isUnion };
    }
    let dType = extractTypeSize(declaredType);
    if (dType === 0 && typeMap.has("__alias__" + declaredType))
      dType = typeMap.get("__alias__" + declaredType) || 0;
    if (dType === 0 && typeMap.has("__union__" + declaredType)) {
      if (vType === 0) {
        let typeStart = exprStr.length - 1;
        while (typeStart >= 0) {
          const char = exprStr[typeStart];
          if (char === undefined || char < "0" || char > "9") break;
          typeStart--;
        }
        if (typeStart >= 0 && typeStart < exprStr.length) {
          const typeSuffix = exprStr.slice(typeStart),
            firstChar = typeSuffix[0];
          if (firstChar === "I" || firstChar === "U")
            vType = extractTypeSize(typeSuffix);
        }
      }
      dType = -1;
      isUnion = true;
    }
    if (dType > 0) {
      if (vType > 0 && vType > dType)
        throw new Error(`bad type: ${vType} to U${dType}`);
      vType = dType;
    }
  }
  return { vType, isUnion };
}

export function findColonInBeforeEq(beforeEq: string): number {
  let colonIndex = -1,
    parenDepth = 0;
  for (let i = 0; i < beforeEq.length; i++) {
    const ch = beforeEq[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === ":" && parenDepth === 0) {
      colonIndex = i;
      break;
    }
  }
  return colonIndex;
}
