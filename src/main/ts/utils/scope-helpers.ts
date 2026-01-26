import { extractTypedInfo } from "../parser";
import { extractTypeSize } from "../type-utils";
import { isFunctionType } from "./function/function-utils";
import { parseArrayType } from "./array";

// Track local functions defined in the current scope
let localFunctionNames: Set<string> | undefined;

export const getLocalFunctionNames = () => localFunctionNames;

export const setLocalFunctionNames = (names: Set<string> | undefined) => {
  localFunctionNames = names;
};

export const addLocalFunctionName = (name: string) => {
  if (!localFunctionNames) {
    localFunctionNames = new Set();
  }
  localFunctionNames.add(name);
};

export function trackDepths(
  s: string,
  startIdx: number,
  endIdx: number,
  predicate: (i: number, depth: DepthState) => boolean,
): { index: number; depth: DepthState } {
  const depth = { paren: 0, brace: 0, bracket: 0 };
  for (let i = startIdx; i < endIdx; i++) {
    const ch = s[i];
    if (ch === "(") depth.paren++;
    else if (ch === ")") depth.paren--;
    else if (ch === "{") depth.brace++;
    else if (ch === "}") depth.brace--;
    else if (ch === "[") depth.bracket++;
    else if (ch === "]") depth.bracket--;
    if (predicate(i, depth)) return { index: i, depth };
  }
  return { index: -1, depth };
}

export interface DepthState {
  paren: number;
  brace: number;
  bracket: number;
}

export function findSemicolonIndex(s: string): number {
  const result = trackDepths(
    s,
    0,
    s.length,
    (_, d) => s[_] === ";" && d.brace === 0 && d.paren === 0 && d.bracket === 0,
  );
  return result.index;
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
  // Check if this is an array type
  const arrayType = parseArrayType(typeStr);
  if (arrayType) {
    return -3; // Special marker for array type
  }

  let vType = extractTypeSize(typeStr);
  if (vType === 0 && typeMap.has("__alias__" + typeStr))
    vType = typeMap.get("__alias__" + typeStr) || 0;
  return vType;
}

export function findDeclStringAndRestIndex(s: string): {
  declStr: string;
  restIndex: number;
} {
  const semiIndex = findSemicolonIndex(s);
  let declStr: string, restIndex: number;

  if (semiIndex === -1) {
    const eqIndex = s.indexOf("=");
    if (eqIndex === -1) return { declStr: "", restIndex: 0 };
    const afterEq = s.slice(eqIndex + 1).trim(),
      trimLenDiff = s.slice(eqIndex + 1).length - afterEq.length;

    if (afterEq.startsWith("match") || afterEq.startsWith("loop")) {
      let exprBraceDepth = 0,
        exprParenDepth = 0,
        exprBraceCloseIdx = -1;
      for (let i = 0; i < afterEq.length; i++) {
        const ch = afterEq[i];
        if (ch === "(") exprParenDepth++;
        else if (ch === ")") exprParenDepth--;
        else if (ch === "{") exprBraceDepth++;
        else if (ch === "}") {
          exprBraceDepth--;
          if (exprBraceDepth === 0 && exprParenDepth === 0) {
            exprBraceCloseIdx = i;
            break;
          }
        }
      }
      if (exprBraceCloseIdx !== -1) {
        restIndex = eqIndex + 1 + trimLenDiff + exprBraceCloseIdx + 1;
        declStr = s.slice(0, restIndex);
      } else return { declStr: "", restIndex: 0 };
    } else return { declStr: "", restIndex: 0 };
  } else {
    declStr = s.slice(0, semiIndex);
    restIndex = semiIndex + 1;
  }

  return { declStr, restIndex };
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
