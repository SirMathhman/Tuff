import { extractTypeSize } from "../../type-utils";

export function isFunctionType(typeStr: string): boolean {
  const t = typeStr.trim();
  if (!t.startsWith("(") || !t.includes("=>")) return false;
  const arrowIdx = t.indexOf("=>");
  let parenCount = 0;
  for (let i = 0; i < arrowIdx; i++) {
    if (t[i] === "(") parenCount++;
    else if (t[i] === ")") parenCount--;
  }
  return parenCount === 0;
}

export function findClosingParenIndex(str: string, startIndex: number): number {
  let parenDepth = 0;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === "(") parenDepth++;
    else if (str[i] === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        return i;
      }
    }
  }
  return -1;
}

export function splitParametersRespectingParens(paramsStr: string): string[] {
  const parts: string[] = [];
  let current = "",
    parenD = 0;
  for (let i = 0; i < paramsStr.length; i++) {
    const ch = paramsStr[i];
    if (ch === "(") parenD++;
    else if (ch === ")") parenD--;
    else if (ch === "," && parenD === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function extractReturnTypeFromFunctionType(
  funcTypeStr: string,
  typeMap: Map<string, number>,
): number {
  const arrowIdx = funcTypeStr.indexOf("=>");
  if (arrowIdx === -1) return 0;
  const returnTypeStr = funcTypeStr.slice(arrowIdx + 2).trim();
  let returnType = extractTypeSize(returnTypeStr);
  if (returnType === 0 && typeMap.has("__alias__" + returnTypeStr))
    returnType = typeMap.get("__alias__" + returnTypeStr) || 0;
  return returnType;
}
