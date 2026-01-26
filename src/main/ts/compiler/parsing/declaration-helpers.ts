import {
  isWhitespace,
  isIdentifierChar,
  isIdentifierStartChar,
  charAt,
  readIdentifier,
  skipAngleBrackets,
} from "./string-helpers";
import { parseBracedBlock } from "./parse-helpers";

export function validateParamReferences(
  paramsStr: string,
  _fnName: string,
  variables: Map<string, Record<string, unknown>>,
): void {
  const paramParts = paramsStr.split(",");
  for (const part of paramParts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx !== -1) {
      const paramName = part.slice(0, colonIdx).trim();
      if (paramName && variables.has(paramName)) {
        throw new Error(
          `Parameter '${paramName}' shadows an existing variable`,
        );
      }
    }
  }
}

export function extractDestructuringFields(
  source: string,
  start: number,
): string[] {
  const fields: string[] = [];
  let i = start + 1; // Skip opening {
  while (i < source.length && source[i] !== "}") {
    const ch = charAt(source, i);
    if (isIdentifierStartChar(ch)) {
      const fieldStart = i;
      while (i < source.length && isIdentifierChar(charAt(source, i))) i++;
      fields.push(source.slice(fieldStart, i));
    } else {
      i++;
    }
  }
  return fields;
}

export function skipToNextStatement(source: string, i: number): number {
  let idx = i;
  while (idx < source.length) {
    const ch = source[idx];
    if (ch === ";") return idx + 1;
    if (ch === "{") {
      const block = parseBracedBlock(source, idx);
      idx = block.endIdx;
      // Optional semicolon after a braced block
      if (idx < source.length && source[idx] === ";") return idx + 1;
      return idx;
    }
    idx++;
  }
  return idx;
}

export function skipWhitespaceOnly(source: string, i: number): number {
  while (i < source.length && isWhitespace(source[i])) i++;
  return i;
}

export function findMatchingCloseBrace(
  source: string,
  openBraceIndex: number,
): number {
  return parseBracedBlock(source, openBraceIndex).endIdx;
}

/**
 * Extract generic type parameters from function header
 */
export function extractGenericParameters(
  source: string,
  startPos: number,
): { generics: string[] | undefined; endPos: number } {
  if (startPos >= source.length || source[startPos] !== "<") {
    return { generics: undefined, endPos: startPos };
  }
  const angleStart = startPos;
  const endPos = skipAngleBrackets(source, startPos);
  const genericStr = source.slice(angleStart + 1, endPos - 1).trim();
  return {
    generics: genericStr
      ? genericStr.split(",").map((p) => p.trim())
      : undefined,
    endPos,
  };
}

/**
 * Parse name and generic parameters for a declaration (function or struct)
 * Returns the name, final position after generics, and generic list
 */
export function parseNameAndGenerics(
  source: string,
  startPos: number,
): { name: string; endPos: number; generics: string[] | undefined } {
  let j = startPos;
  const parsedName = readIdentifier(source, j);
  const name = parsedName.name;
  j = parsedName.endIdx;
  j = skipWhitespaceOnly(source, j);
  const { generics, endPos } = extractGenericParameters(source, j);
  j = skipWhitespaceOnly(source, endPos);
  return { name, endPos: j, generics };
}
