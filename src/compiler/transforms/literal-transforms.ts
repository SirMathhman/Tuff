import {
  isWhitespace,
  isIdentifierChar,
  isDigit,
} from "../parsing/string-helpers";
import { validateTypeConstraint } from "../validation/type-utils";
import { getEscapeCode } from "../../utils/helpers/char-utils";

/**
 * Transform char literals to their character codes
 */
function transformCharLiterals(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (source[i] === "'") {
      let j = i + 1;
      let content = "";

      // Scan until closing quote
      while (j < source.length) {
        if (source[j] === "'") {
          break;
        }
        if (source[j] === "\\" && j + 1 < source.length) {
          content += source.slice(j, j + 2);
          j += 2;
        } else {
          content += source[j];
          j++;
        }
      }

      if (j >= source.length) {
        // No closing quote found
        result += source[i];
        i++;
        continue;
      }

      // Validate and convert char literal
      if (content.length === 0) {
        throw new Error("empty char literal");
      }

      let charCode: number;
      if (content.length === 1) {
        charCode = content.charCodeAt(0);
      } else if (content[0] === "\\" && content.length === 2) {
        charCode = getEscapeCode(content[1]!);
      } else {
        throw new Error(`multi-character literal: '${content}'`);
      }

      result += charCode.toString();
      i = j + 1;
    } else {
      result += source[i];
      i++;
    }
  }

  return result;
}

/**
 * Convert statements to expressions by replacing semicolons with commas
 */
export function convertStatementsToExpressions(source: string): string {
  let result = "";
  let i = source.length - 1;

  while (i >= 0 && (source[i] === ";" || isWhitespace(source[i]))) {
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
 * Export transformers
 */
export { transformCharLiterals };

/**
 * Check if colon at position i is a type annotation
 */
function isTypeAnnotationColon(js: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && isWhitespace(js[j])) j--;
  const afterCloseParen = j >= 0 && js[j] === ")";
  const prevIsLetter =
    j >= 0 &&
    ((js[j]! >= "a" && js[j]! <= "z") || (js[j]! >= "A" && js[j]! <= "Z"));
  return afterCloseParen || prevIsLetter;
}

/**
 * Try to skip a type annotation starting at colon
 */
function trySkipTypeAnnotation(js: string, i: number): number | undefined {
  let typeStart = i + 1;
  while (typeStart < js.length && isWhitespace(js[typeStart])) typeStart++;

  if (typeStart < js.length && isIdentifierChar(js[typeStart])) {
    let typeEnd = typeStart;
    while (
      typeEnd < js.length &&
      (isIdentifierChar(js[typeEnd]) ||
        js[typeEnd] === "[" ||
        js[typeEnd] === "]")
    ) {
      typeEnd++;
    }
    while (typeEnd < js.length && isWhitespace(js[typeEnd])) {
      typeEnd++;
    }

    if (
      typeEnd < js.length &&
      (js[typeEnd] === "=" ||
        js[typeEnd] === "," ||
        js[typeEnd] === ")" ||
        (typeEnd + 1 < js.length &&
          js[typeEnd] === "=" &&
          js[typeEnd + 1] === ">"))
    ) {
      return typeEnd;
    }
  }
  return undefined;
}

/**
 * Parse and validate a numeric literal with optional type suffix
 */
function parseNumericLiteral(
  js: string,
  startI: number,
  isNegative: boolean,
): { endI: number; numStr: string } {
  let i = startI;
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

  return { endI: i, numStr };
}

/**
 * Strip type annotations and validate numeric literals
 */
export function stripTypeAnnotationsAndValidate(js: string): string {
  let result = "";
  let i = 0;

  while (i < js.length) {
    if (js[i] === ":") {
      if (isTypeAnnotationColon(js, i)) {
        const skipTo = trySkipTypeAnnotation(js, i);
        if (skipTo !== undefined) {
          while (result.length > 0 && isWhitespace(result[result.length - 1])) {
            result = result.slice(0, -1);
          }
          i = skipTo;
          continue;
        }
      }
    }

    let isNegative = false;
    if (js[i] === "-" && i + 1 < js.length && isDigit(js[i + 1])) {
      isNegative = true;
      result += js[i];
      i++;
    }

    if (i < js.length && isDigit(js[i])) {
      const numInfo = parseNumericLiteral(js, i, isNegative);
      i = numInfo.endI;
      result += numInfo.numStr;
    } else if (i < js.length) {
      result += js[i];
      i++;
    }
  }

  return result;
}
