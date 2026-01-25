import { findMatchingClose } from "../match";
import { isValidIdentifier } from "../utils/identifier-utils";
import { parseArrayLiteral } from "../utils/array";

export function shouldSkipLambda(
  s: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): boolean {
  if (openChar !== "(") return false;
  const closeIdx = findMatchingClose(s, openIndex, openChar, closeChar);
  if (closeIdx === -1 || closeIdx + 2 >= s.length) return false;
  return s
    .slice(closeIdx + 1)
    .trim()
    .startsWith("=>");
}

export function shouldSkipArrayIndexing(
  s: string,
  openIndex: number,
  openChar: string,
): boolean {
  if (openChar !== "[" || openIndex === 0) return false;
  const beforeBracket = s[openIndex - 1];
  if (!beforeBracket) return false;
  if (
    (beforeBracket >= "a" && beforeBracket <= "z") ||
    (beforeBracket >= "A" && beforeBracket <= "Z") ||
    (beforeBracket >= "0" && beforeBracket <= "9") ||
    beforeBracket === "_" ||
    beforeBracket === ")" ||
    beforeBracket === "]" ||
    beforeBracket === '"' ||
    beforeBracket === "'"
  ) {
    return true;
  }
  const closeIdx = findMatchingClose(s, openIndex, openChar, "]");
  if (closeIdx === -1) return false;
  const inside = s.slice(openIndex + 1, closeIdx);
  return inside === "" || !!parseArrayLiteral("[" + inside + "]");
}

export function shouldSkipMatchOrStruct(
  s: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
  typeMap: Map<string, number>,
): boolean {
  if (openChar !== "{") return false;
  const closeIdx = findMatchingClose(s, openIndex, openChar, closeChar);
  if (closeIdx <= 0) return false;
  const inside = s.slice(openIndex + 1, closeIdx);
  if (inside.includes("case ")) return true;
  if (openIndex === 0) return false;
  const beforeBrace = s.slice(0, openIndex).trim();
  return (
    !!beforeBrace &&
    isValidIdentifier(beforeBrace) &&
    typeMap.has("__struct__" + beforeBrace)
  );
}

export function extractStructName(s: string): string | undefined {
  const angleEnd = s.indexOf(">");
  const angleStart = s.indexOf("<");
  if (angleStart === -1) return s;
  if (angleEnd === -1) return undefined;
  return s.slice(0, angleStart).trim();
}
