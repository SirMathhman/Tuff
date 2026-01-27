import { isArrayInstance, getArrayMetadata } from "../utils/array";

export interface RangeInfo {
  start: number;
  end: number;
}

export interface ArrayInfo {
  arrayId: number;
  values: number[];
}

export function parseRange(
  rangeStr: string,
  scope?: Map<string, number>,
): RangeInfo | undefined {
  const trimmed = rangeStr.trim();
  const dotsIdx = trimmed.indexOf("..");
  if (dotsIdx === -1) return undefined;
  const startStr = trimmed.slice(0, dotsIdx).trim();
  const endStr = trimmed.slice(dotsIdx + 2).trim();

  let start: number;
  let end: number;

  // Try to parse as number first, then as variable from scope
  const startNum = Number(startStr);
  if (Number.isFinite(startNum)) {
    start = startNum;
  } else if (scope) {
    const scopeVal = scope.get(startStr);
    if (scopeVal === undefined || !Number.isFinite(scopeVal)) return undefined;
    start = scopeVal;
  } else {
    return undefined;
  }

  const endNum = Number(endStr);
  if (Number.isFinite(endNum)) {
    end = endNum;
  } else if (scope) {
    const scopeVal = scope.get(endStr);
    if (scopeVal === undefined || !Number.isFinite(scopeVal)) return undefined;
    end = scopeVal;
  } else {
    return undefined;
  }

  return { start, end };
}

export function parseArrayIdentifier(
  rangeStr: string,
  scope: Map<string, number>,
): ArrayInfo | undefined {
  const trimmed = rangeStr.trim();
  // Check if it's a simple identifier (no operators or brackets)
  if (trimmed.includes(" ") || trimmed.includes("[") || trimmed.includes("(")) {
    return undefined;
  }
  const value = scope.get(trimmed);
  if (value === undefined || !isArrayInstance(value)) {
    return undefined;
  }
  const metadata = getArrayMetadata(value);
  if (!metadata) return undefined;
  return {
    arrayId: value,
    values: metadata.values.slice(0, metadata.initialized),
  };
}

export function extractLoopVarName(varDeclStr: string): string | undefined {
  const declTokens: string[] = [];
  let currentToken = "";
  for (const ch of varDeclStr) {
    if (ch === " " || ch === ":" || ch === "\t") {
      if (currentToken) {
        declTokens.push(currentToken);
        currentToken = "";
      }
    } else {
      currentToken += ch;
    }
  }
  if (currentToken) declTokens.push(currentToken);
  if (declTokens[0] === "let") {
    return declTokens[1] === "mut" ? declTokens[2] : declTokens[1];
  }
  return undefined;
}

export function findInKeywordPosition(
  trimmed: string,
  startIdx: number,
): number {
  for (let i = startIdx; i < trimmed.length - 1; i++) {
    if (
      trimmed[i] === " " &&
      trimmed[i + 1] === "i" &&
      trimmed[i + 2] === "n" &&
      (i + 3 >= trimmed.length ||
        trimmed[i + 3] === " " ||
        trimmed[i + 3] === "(")
    ) {
      return i + 1;
    }
  }
  return -1;
}
