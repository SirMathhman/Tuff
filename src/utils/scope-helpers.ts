import { extractTypedInfo } from "../parser";
import { extractTypeSize } from "../type-utils";
import { isFunctionType } from "./function-utils";
import { parseArrayType, type ArrayType } from "./array";

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

export function isArrayTypeAnnotation(typeStr: string): boolean {
  return parseArrayType(typeStr) !== undefined;
}

export function extractArrayTypeInfo(
  typeStr: string,
  typeMap: Map<string, number>,
): { arrayType: ArrayType; elementTypeName: string } | undefined {
  // Use parseArrayType to extract the basic array type info
  const baseArrayType = parseArrayType(typeStr);
  if (!baseArrayType) return undefined;

  // Extract element type name
  const t = typeStr.trim();
  const closeIdx = t.lastIndexOf("]");
  if (closeIdx === -1) return undefined;

  const inner = t.slice(1, closeIdx).trim();
  const parts = inner.split(";");

  if (parts.length !== 3) return undefined;

  const elemTypeStr = parts[0]?.trim();

  if (!elemTypeStr) return undefined;

  // Resolve element type
  let elementType = extractTypeSize(elemTypeStr);
  if (elementType === 0 && typeMap.has("__alias__" + elemTypeStr)) {
    elementType = typeMap.get("__alias__" + elemTypeStr) || 0;
  }

  return {
    arrayType: {
      elementType,
      initializedCount: baseArrayType.initializedCount,
      capacity: baseArrayType.capacity,
    },
    elementTypeName: elemTypeStr,
  };
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
