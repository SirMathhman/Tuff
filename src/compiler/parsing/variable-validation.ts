import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
  isDigit,
  charAt,
} from "./string-helpers";
import {
  skipStructDeclaration,
  getStructBracePosition,
} from "./struct-helpers";
import { isKeyword } from "../keywords";

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
}

// Track declared type aliases
const declaredTypes = new Set<string>();

export function addDeclaredType(name: string): void {
  declaredTypes.add(name);
}

export function isDeclaredType(name: string): boolean {
  return declaredTypes.has(name);
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
const SPECIAL_IDENTIFIERS = new Set([
  "true",
  "false",
  "_",
  "length",
  "this",
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
]);

function checkWriteAccess(
  name: string,
  variables: Map<string, VariableInfo>,
): void {
  if (variables.has(name)) {
    if (!variables.get(name)!.mutable) {
      throw new Error(
        `Variable '${name}' is immutable and cannot be reassigned`,
      );
    }
  } else if (!isKeyword(name) && !SPECIAL_IDENTIFIERS.has(name)) {
    throw new Error(`Variable '${name}' is not defined`);
  }
}

function checkReadAccess(
  name: string,
  variables: Map<string, VariableInfo>,
): void {
  if (
    !variables.has(name) &&
    !isKeyword(name) &&
    !SPECIAL_IDENTIFIERS.has(name) &&
    !isDeclaredType(name)
  ) {
    throw new Error(`Variable '${name}' is not defined`);
  }
}

function skipDeclaration(source: string, i: number, keyword: string): number {
  if (matchWord(source, i, keyword)) {
    while (i < source.length && source[i] !== ";") i++;
    if (i < source.length) i++;
    return i;
  }
  return -1;
}

function skipStructInstantiation(
  source: string,
  i: number,
  _name: string,
): number {
  // Check if identifier is followed by '{'  (possibly with generics <...>)
  const bracePos = getStructBracePosition(source, i);
  if (bracePos === -1) return -1;

  // Skip the struct body
  let j = bracePos + 1; // Start after the opening brace
  let braceDepth = 1;
  while (j < source.length && braceDepth > 0) {
    if (source[j] === "{") braceDepth++;
    else if (source[j] === "}") braceDepth--;
    j++;
  }
  return j;
}

function skipParentheses(source: string, i: number): number {
  if (source[i] !== "(") return -1;
  let parenDepth = 1;
  i++;
  while (i < source.length && parenDepth > 0) {
    if (source[i] === "(") parenDepth++;
    else if (source[i] === ")") parenDepth--;
    i++;
  }
  return i;
}

function validateIdentifier(
  source: string,
  i: number,
  variables: Map<string, VariableInfo>,
): number {
  if (!isIdentifierChar(source[i]) || isDigit(source[i])) return -1;
  const nameStart = i;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  const name = source.slice(nameStart, i);

  // Check if this is a struct instantiation (skip validation of fields inside)
  const structInstEnd = skipStructInstantiation(source, i, name);
  if (structInstEnd !== -1) {
    return structInstEnd;
  }

  let nextIdx = i;
  while (nextIdx < source.length && isWhitespace(source[nextIdx])) nextIdx++;
  const nextChar = nextIdx < source.length ? source[nextIdx]! : "";
  if (nextChar === "=" && charAt(source, nextIdx + 1) !== "=") {
    checkWriteAccess(name, variables);
  } else if (REFERENCE_DELIMITERS.has(nextChar)) {
    checkReadAccess(name, variables);
  }
  return i;
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
    let newI = skipDeclaration(source, i, "let");
    if (newI !== -1) {
      i = newI;
      continue;
    }
    newI = skipDeclaration(source, i, "type");
    if (newI !== -1) {
      i = newI;
      continue;
    }
    newI = skipDeclaration(source, i, "fn");
    if (newI !== -1) {
      i = newI;
      continue;
    }
    newI = skipStructDeclaration(source, i);
    if (newI !== -1) {
      i = newI;
      continue;
    }
    newI = skipParentheses(source, i);
    if (newI !== -1) {
      i = newI;
      continue;
    }
    newI = validateIdentifier(source, i, variables);
    if (newI !== -1) {
      i = newI;
      continue;
    }
    i++;
  }
}
