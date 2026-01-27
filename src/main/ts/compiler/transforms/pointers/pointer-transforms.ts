import {
  isIdentifierChar,
  isWhitespace,
  skipWhitespace,
} from "../../parsing/string-helpers";

/**
 * Transform pointer operations for JavaScript execution.
 *
 * In Tuff:
 *   let x = 100; let y : *I32 = &x; *y
 *
 * Becomes in JS:
 *   x = 100; y = x; y
 *
 * For arrays:
 *   let slice : *[I32] = &array; slice[0]
 * Becomes:
 *   slice = array; slice[0]
 */

function findIdentifierEnd(source: string, start: number): number {
  let i = start;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  return i;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentifierStartChar(ch: string): boolean {
  return isIdentifierChar(ch) && !isDigit(ch);
}

/**
 * Check if the context before position indicates this could be a dereference
 * (not multiplication). Returns true if it looks like a dereference context.
 */
function isDerefContext(source: string, pos: number): boolean {
  let i = pos - 1;
  while (i >= 0 && isWhitespace(source[i]!)) i--;

  if (i < 0) return true;

  const prevChar = source[i]!;
  const derefPrecedingChars = new Set([
    ";",
    ",",
    "(",
    "[",
    "{",
    "=",
    ":",
    ">",
    "+",
    "-",
    "/",
    "%",
    "!",
    "&",
    "|",
    "^",
    "~",
    "?",
    "<",
  ]);
  if (derefPrecedingChars.has(prevChar)) return true;
  if (isIdentifierChar(prevChar) || prevChar === ")") return false;

  return false;
}

/**
 * Try to extract identifier after pointer operator, returns { varName, endIdx } or undefined
 */
function tryExtractPointerTarget(
  source: string,
  operatorPos: number,
): { varName: string; endIdx: number } | undefined {
  let nextNonWS = skipWhitespace(source, operatorPos + 1);
  
  // Skip 'mut' keyword if present (&mut varName or *mut varName)
  if (
    source.slice(nextNonWS, nextNonWS + 3) === "mut" &&
    nextNonWS + 3 < source.length &&
    isWhitespace(source[nextNonWS + 3]!)
  ) {
    nextNonWS = skipWhitespace(source, nextNonWS + 3);
  }
  
  const ch = source[nextNonWS];
  if (nextNonWS >= source.length || !ch || !isIdentifierStartChar(ch)) {
    return undefined;
  }
  const idEnd = findIdentifierEnd(source, nextNonWS);
  return { varName: source.slice(nextNonWS, idEnd), endIdx: idEnd };
}

function shouldTransformBareVariable(
  source: string,
  varStart: number,
  varEnd: number,
): boolean {
  const prevChar = varStart > 0 ? source[varStart - 1] : "";
  const nextChar = varEnd < source.length ? source[varEnd] : "";

  if (
    prevChar === "&" ||
    nextChar === "[" ||
    nextChar === ":" ||
    nextChar === "="
  ) {
    return false;
  }

  let j = varStart - 1;
  while (j >= 0 && source[j] === " ") j--;
  if (j >= 0 && source[j] === "=") {
    return false;
  }

  return true;
}

/**
 * Transform address-of operator (&x) and dereference (*y) to simple variable references
 * When wrapped variables are provided, also transform bare variable references to array access
 */
export function transformPointers(
  source: string,
  wrappedVars?: Set<string>,
): string {
  let result = "";
  let i = 0;
  const wrapped = wrappedVars || new Set<string>();

  while (i < source.length) {
    if (source[i] === "&" && i + 1 < source.length) {
      const target = tryExtractPointerTarget(source, i);
      if (target) {
        result += target.varName;
        i = target.endIdx;
        continue;
      }
    }

    if (
      source[i] === "*" &&
      i + 1 < source.length &&
      isDerefContext(source, i)
    ) {
      const target = tryExtractPointerTarget(source, i);
      if (target) {
        result += target.varName + "[0]";
        i = target.endIdx;
        continue;
      }
    }

    if (isIdentifierStartChar(source[i]!)) {
      let idEnd = i;
      while (idEnd < source.length && isIdentifierChar(source[idEnd]!)) {
        idEnd++;
      }

      const varName = source.slice(i, idEnd);

      if (
        wrapped.has(varName) &&
        shouldTransformBareVariable(source, i, idEnd)
      ) {
        result += varName + "[0]";
        i = idEnd;
        continue;
      }
    }

    result += source[i];
    i++;
  }

  return result;
}
