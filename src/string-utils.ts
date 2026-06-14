/**
 * String utility functions that replace regex patterns.
 * Regex is banned by eslint (no-restricted-syntax) because this is an interpreter.
 */
import {
  isWordChar,
  isDigit,
  isSpace,
  looksLikeKeyValue,
} from "./char-utils.js";

/** Skip leading whitespace and return the index of first non-space char. */
export function skipSpace(s: string, start?: number): number {
  let i = start ?? 0;
  while (i < s.length && isSpace(s[i]!)) i++;
  return i;
}

/** Check if a string starts with whitespace followed by a keyword. */
export function startsWithKeyword(s: string, keyword: string): boolean {
  let i = 0;
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  return s.startsWith(keyword, i);
}

/** Check if a string starts with whitespace followed by one of the given keywords. */
export function startsWithAnyKeyword(s: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    if (startsWithKeyword(s, kw)) return true;
  }
  return false;
}

/** Extract the first identifier (word characters) from a string. */
export function extractIdentifier(s: string): string {
  let i = 0;
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  let end = i;
  while (end < s.length && isWordChar(s[end]!)) end++;
  return s.slice(i, end);
}

/** Check if string starts with a declaration keyword (let, const, var). */
export function isDeclarationStart(s: string): boolean {
  return startsWithAnyKeyword(s, ["let", "const", "var"]);
}

/** Check if string starts with let mut, const mut, or var mut. */
export function isMutableDeclaration(s: string): boolean {
  let i = skipSpace(s);
  if (
    !s.startsWith("let", i) &&
    !s.startsWith("const", i) &&
    !s.startsWith("var", i)
  )
    return false;
  i += 3;
  i = skipSpace(s, i);
  return s.startsWith("mut", i);
}

/** Check if a string looks like a built-in type (starts with uppercase letter followed by digit). */
export function isBuiltInType(s: string): boolean {
  if (s.length < 2) return false;
  const c0 = s.charCodeAt(0);
  const c1 = s.charCodeAt(1);
  return c0 >= 65 && c0 <= 90 && c1 >= 48 && c1 <= 57;
}

/** Check if a string starts with a negative number. */
export function startsWithNegativeNumber(s: string): boolean {
  let i = skipSpace(s);
  if (i < s.length && s[i] === "-") {
    i++;
    return i < s.length && isDigit(s[i]!);
  }
  return false;
}

/** Check if a string starts with a number (optional minus). */
export function startsWithNumber(s: string): boolean {
  let i = skipSpace(s);
  if (i < s.length && s[i] === "-") i++;
  return i < s.length && isDigit(s[i]!);
}

/** Check if a string contains != (has refinement). */
export function hasRefinement(s: string): boolean {
  return s.includes("!=");
}

/** Find all != N refinement values in a type annotation string. */
export function extractRefinementValues(s: string): number[] {
  const values: number[] = [];
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf("!=", i);
    if (idx === -1) break;
    let j = idx + 2;
    while (j < s.length && isSpace(s[j]!)) j++;
    let sign = 1;
    if (j < s.length && s[j] === "-") {
      sign = -1;
      j++;
    }
    let numStr = "";
    while (j < s.length && isDigit(s[j]!)) {
      numStr += s[j];
      j++;
    }
    if (j < s.length && s[j] === ".") {
      numStr += ".";
      j++;
      while (j < s.length && isDigit(s[j]!)) {
        numStr += s[j];
        j++;
      }
    }
    if (numStr.length > 0) values.push(sign * parseFloat(numStr));
    i = j;
  }
  return values;
}

/** Strip pointer prefix (*) from a type string. */
export function stripPointerPrefix(s: string): string {
  const t = s.trim();
  if (t.startsWith("*")) return t.slice(1).trim();
  return t;
}

/** Strip refinement chain from a type string. */
export function stripRefinement(s: string): string {
  const idx = s.indexOf("!=");
  if (idx >= 0) return s.substring(0, idx).trim();
  return s;
}

/** Check if a string starts with [ after optional whitespace. */
export function startsWithBracket(s: string): boolean {
  const i = skipSpace(s);
  return i < s.length && s[i] === "[";
}

/** Check if a string starts with ( after optional whitespace. */
export function startsWithParen(s: string): boolean {
  const i = skipSpace(s);
  return i < s.length && s[i] === "(";
}

/** Check if a string starts with & followed by a word character after optional whitespace. */
export function startsWithAmpersand(s: string): boolean {
  let i = skipSpace(s);
  if (i < s.length && s[i] === "&") {
    i++;
    i = skipSpace(s, i);
    return i < s.length && isWordChar(s[i]!);
  }
  return false;
}

/** Check if a string looks like an object literal (contains : between non-operator context). */
export function looksLikeObjectLiteral(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return false;
  const inner = t.slice(1, -1).trim();
  return inner.length > 0 && looksLikeKeyValue(inner);
}

/** Match an address-of pattern: &name. Returns the variable name or null. */
export function matchAddressOf(s: string): string | null {
  const t = s.trim();
  if (!t.startsWith("&")) return null;
  const name = extractIdentifier(t.slice(1));
  const afterName = t.slice(1).trim();
  if (afterName === name) return name;
  return null;
}
