import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
  isDigit,
  charAt,
} from "./string-helpers";
import { validateTypeAnnotation } from "../validation/validation";
import { isKeyword } from "../keywords";
import { parseUntilSemicolon } from "./parse-helpers";

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
}

const REFERENCE_DELIMITERS = new Set([
  "+",
  "-",
  "*",
  "/",
  ";",
  ")",
  "]",
  "}",
  ",",
  ":",
  "<",
  ">",
  "=",
]);
const SPECIAL_IDENTIFIERS = new Set(["true", "false", "_"]);

function parseMutability(
  source: string,
  i: number,
): { isMutable: boolean; nextIndex: number } {
  let index = i;
  let isMutable = false;
  if (matchWord(source, index, "mut")) {
    isMutable = true;
    index += 3;
    while (index < source.length && isWhitespace(source[index])) index++;
  }
  return { isMutable, nextIndex: index };
}

function parseVarName(
  source: string,
  i: number,
): { name: string; nextIndex: number } {
  const nameStart = i;
  let index = i;
  while (index < source.length && isIdentifierChar(source[index])) index++;
  const name = source.slice(nameStart, index);
  if (!name) throw new Error("Expected variable name after let");
  return { name, nextIndex: index };
}

function parseTypeAnnotation(
  source: string,
  i: number,
): { type: string | undefined; nextIndex: number } {
  let index = i;
  while (index < source.length && isWhitespace(source[index])) index++;
  if (index >= source.length || source[index] !== ":")
    return { type: undefined, nextIndex: index };
  index++;
  while (index < source.length && isWhitespace(source[index])) index++;
  const typeStart = index;
  while (
    index < source.length &&
    (isIdentifierChar(source[index]) || source[index] === "*")
  )
    index++;
  const type = source.slice(typeStart, index).trim();
  return { type, nextIndex: index };
}

/**
 * Parse a single let declaration
 */
export function parseLetDeclaration(
  source: string,
  startIndex: number,
): {
  nextIndex: number;
  varName: string;
  typeAnnotation?: string;
  isMutable: boolean;
} {
  let i = startIndex + 3;
  while (i < source.length && isWhitespace(source[i])) i++;
  const { isMutable, nextIndex: mutIndex } = parseMutability(source, i);
  i = mutIndex;
  const { name: varName, nextIndex: nameIndex } = parseVarName(source, i);
  i = nameIndex;
  const { type: typeAnnotation, nextIndex: typeIndex } = parseTypeAnnotation(
    source,
    i,
  );
  i = typeIndex;
  while (i < source.length && isWhitespace(source[i])) i++;
  if (i < source.length && source[i] === "=") {
    i++;
    while (i < source.length && isWhitespace(source[i])) i++;
    const { content: value, endIdx: valueEndIdx } = parseUntilSemicolon(
      source,
      i,
    );
    i = valueEndIdx;
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
    while (i < source.length && isWhitespace(source[i])) i++;
    if (i >= source.length) break;

    if (source[i] === "{" || source[i] === "}") {
      i++;
      continue;
    }

    if (matchWord(source, i, "let")) {
      while (i < source.length && source[i] !== ";") i++;
      i++;
      continue;
    }

    if (isIdentifierChar(source[i]) && !isDigit(source[i])) {
      const nameStart = i;
      while (i < source.length && isIdentifierChar(source[i])) i++;
      const name = source.slice(nameStart, i);

      let nextIdx = i;
      while (nextIdx < source.length && isWhitespace(source[nextIdx]))
        nextIdx++;
      const nextChar = nextIdx < source.length ? source[nextIdx]! : "";

      if (nextChar === "=" && charAt(source, nextIdx + 1) !== "=") {
        if (variables.has(name)) {
          if (!variables.get(name)!.mutable) {
            throw new Error(
              `Variable '${name}' is immutable and cannot be reassigned`,
            );
          }
        } else if (!isKeyword(name) && !SPECIAL_IDENTIFIERS.has(name)) {
          throw new Error(`Variable '${name}' is not defined`);
        }
      } else if (REFERENCE_DELIMITERS.has(nextChar)) {
        if (
          !variables.has(name) &&
          !isKeyword(name) &&
          !SPECIAL_IDENTIFIERS.has(name)
        ) {
          throw new Error(`Variable '${name}' is not defined`);
        }
      }
      continue;
    }
    i++;
  }
}
