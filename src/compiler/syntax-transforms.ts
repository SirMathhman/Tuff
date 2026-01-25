import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
  isDigit,
  charAt,
} from "./string-helpers";
import { validateTypeConstraint } from "./type-utils";

/**
 * Skip whitespace in source starting at index
 */
function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index]))
    index++;
  return index;
}

/**
 * Remove Tuff-specific syntax like let, mut, type annotations
 */
export function removeTypeSyntax(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (source[i] === "{" || source[i] === "}") {
      i++;
      continue;
    }

    if (matchWord(source, i, "let")) {
      i = skipWhitespace(source, i + 3);
      if (matchWord(source, i, "mut"))
        i = skipWhitespace(source, i + 3);

      const varStart = i;
      while (i < source.length && isIdentifierChar(source[i]))
        i++;
      result += source.slice(varStart, i);

      i = skipWhitespace(source, i);
      if (i < source.length && source[i] === ":") {
        i++;
        i = skipWhitespace(source, i);
        while (
          i < source.length &&
          (isIdentifierChar(source[i]) || source[i] === "*")
        )
          i++;
      }
      i = skipWhitespace(source, i);
      continue;
    }

    result += source[i];
    i++;
  }
  return result;
}

/**
 * Extract variables that need to be declared in JavaScript scope
 */
export function extractVarDeclarations(source: string): {
  expression: string;
  varDeclarations: string[];
} {
  const varDeclDecls = new Set<string>();
  let result = "";
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (isWhitespace(ch)) {
      result += ch;
      i++;
      continue;
    }

    if (isIdentifierChar(ch) && !isDigit(ch)) {
      const nameStart = i;
      while (i < source.length && isIdentifierChar(source[i]))
        i++;
      const name = source.slice(nameStart, i);

      const nextIdx = skipWhitespace(source, i);
      if (
        nextIdx < source.length &&
        source[nextIdx] === "=" &&
        charAt(source, nextIdx + 1) !== "="
      ) {
        varDeclDecls.add(name);
        result += name;
        i = nextIdx;
      } else {
        result += name;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return { expression: result, varDeclarations: Array.from(varDeclDecls) };
}

/**
 * Convert statements to expressions by replacing semicolons with commas
 */
export function convertStatementsToExpressions(source: string): string {
  let result = "";
  let i = source.length - 1;

  while (
    i >= 0 &&
    (source[i] === ";" || isWhitespace(source[i]))
  ) {
    if (source[i] === ";") {
      i--;
      break;
    }
    i--;
  }

  let depth = 0;
  for (let j = 0; j <= i; j++) {
    if (source[j] === "{" || source[j] === "[" || source[j] === "(") depth++;
    else if (source[j] === "}" || source[j] === "]" || source[j] === ")")
      depth--;
    result += source[j] === ";" && depth === 0 ? "," : source[j];
  }

  return result;
}

/**
 * Replace boolean literals (true/false) with numeric equivalents (1/0)
 */
export function replaceBooleanLiterals(js: string): string {
  let result = "";
  let i = 0;

  while (i < js.length) {
    if (
      js.slice(i, i + 4) === "true" &&
      (i === 0 || !isIdentifierChar(js[i - 1])) &&
      (i + 4 >= js.length || !isIdentifierChar(js[i + 4]))
    ) {
      result += "1";
      i += 4;
    } else if (
      js.slice(i, i + 5) === "false" &&
      (i === 0 || !isIdentifierChar(js[i - 1])) &&
      (i + 5 >= js.length || !isIdentifierChar(js[i + 5]))
    ) {
      result += "0";
      i += 5;
    } else {
      result += js[i];
      i++;
    }
  }

  return result;
}

/**
 * Strip type annotations and validate numeric literals
 */
export function stripTypeAnnotationsAndValidate(js: string): string {
  let result = "";
  let i = 0;

  while (i < js.length) {
    let isNegative = false;
    if (
      js[i] === "-" &&
      i + 1 < js.length &&
      isDigit(js[i + 1])
    ) {
      isNegative = true;
      result += js[i];
      i++;
    }

    if (i < js.length && isDigit(js[i])) {
      const numStart = i;
      while (i < js.length && isDigit(js[i])) i++;
      const numStr = js.slice(numStart, i);
      const finalValue = isNegative ? -BigInt(numStr) : BigInt(numStr);

      if (i < js.length && (js[i] === "U" || js[i] === "I")) {
        const typeStart = i;
        i++;
        while (i < js.length && isDigit(js[i])) i++;
        validateTypeConstraint(js.slice(typeStart, i), finalValue);
      }

      result += numStr;
    } else if (i < js.length) {
      result += js[i];
      i++;
    }
  }

  return result;
}
