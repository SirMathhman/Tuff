import { StringHelpers } from "./string-helpers";
import { validateTypeAnnotation } from "./validation";
import { isKeyword } from "./keywords";

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
}

const REFERENCE_DELIMITERS = new Set(["+", "-", "*", "/", ";", ")", "]", "}", ",", ":", "<", ">", "="]);
const SPECIAL_IDENTIFIERS = new Set(["true", "false"]);

/**
 * Parse a single let declaration
 */
export function parseLetDeclaration(
  source: string,
  startIndex: number,
): { nextIndex: number; varName: string; typeAnnotation?: string; isMutable: boolean } {
  let i = startIndex + 3;
  while (i < source.length && StringHelpers.isWhitespace(source[i])) i++;

  let isMutable = false;
  if (StringHelpers.matchWord(source, i, "mut")) {
    isMutable = true;
    i += 3;
    while (i < source.length && StringHelpers.isWhitespace(source[i])) i++;
  }

  const nameStart = i;
  while (i < source.length && StringHelpers.isIdentifierChar(source[i])) i++;
  const varName = source.slice(nameStart, i);
  if (!varName) throw new Error("Expected variable name after let");

  while (i < source.length && StringHelpers.isWhitespace(source[i])) i++;

  let typeAnnotation: string | undefined;
  if (i < source.length && source[i] === ":") {
    i++;
    while (i < source.length && StringHelpers.isWhitespace(source[i])) i++;
    const typeStart = i;
    while (i < source.length && (StringHelpers.isIdentifierChar(source[i]) || source[i] === "*")) i++;
    typeAnnotation = source.slice(typeStart, i).trim();
    while (i < source.length && StringHelpers.isWhitespace(source[i])) i++;
  }

  if (i < source.length && source[i] === "=") {
    i++;
    while (i < source.length && StringHelpers.isWhitespace(source[i])) i++;
    const valueStart = i;
    let depth = 0;
    while (i < source.length) {
      if (source[i] === "{" || source[i] === "[" || source[i] === "(") depth++;
      else if (source[i] === "}" || source[i] === "]" || source[i] === ")") depth--;
      else if (source[i] === ";" && depth === 0) break;
      i++;
    }
    const value = source.slice(valueStart, i).trim();
    if (typeAnnotation) validateTypeAnnotation(value, typeAnnotation);
  }

  if (i < source.length && source[i] === ";") i++;
  return { nextIndex: i, varName, typeAnnotation, isMutable };
}

/**
 * Validate variable usage (assignments and references)
 */
export function validateVariableUsage(
  source: string,
  variables: Map<string, VariableInfo>,
): void {
  let i = 0;
  while (i < source.length) {
    while (i < source.length && StringHelpers.isWhitespace(source[i])) i++;
    if (i >= source.length) break;

    if (source[i] === "{" || source[i] === "}") {
      i++;
      continue;
    }

    if (StringHelpers.matchWord(source, i, "let")) {
      while (i < source.length && source[i] !== ";") i++;
      i++;
      continue;
    }

    if (StringHelpers.isIdentifierChar(source[i]) && !StringHelpers.isDigit(source[i])) {
      const nameStart = i;
      while (i < source.length && StringHelpers.isIdentifierChar(source[i])) i++;
      const name = source.slice(nameStart, i);

      let nextIdx = i;
      while (nextIdx < source.length && StringHelpers.isWhitespace(source[nextIdx])) nextIdx++;
      const nextChar = nextIdx < source.length ? source[nextIdx]! : "";

      if (nextChar === "=" && StringHelpers.charAt(source, nextIdx + 1) !== "=") {
        if (variables.has(name)) {
          if (!variables.get(name)!.mutable) {
            throw new Error(`Variable '${name}' is immutable and cannot be reassigned`);
          }
        } else if (!isKeyword(name) && !SPECIAL_IDENTIFIERS.has(name)) {
          throw new Error(`Variable '${name}' is not defined`);
        }
      } else if (REFERENCE_DELIMITERS.has(nextChar)) {
        if (!variables.has(name) && !isKeyword(name) && !SPECIAL_IDENTIFIERS.has(name)) {
          throw new Error(`Variable '${name}' is not defined`);
        }
      }
      continue;
    }
    i++;
  }
}
