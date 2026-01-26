import { isWhitespace, matchWord, isIdentifierChar } from "./string-helpers";
import {
  validateTypeAnnotation,
  inferValueType,
} from "../validation/validation";
import { validateTypeSuffixCompatibility } from "../validation/type-utils";
import { parseUntilSemicolon } from "./parse-helpers";

// Re-export from variable-validation for consumers
export {
  validateVariableUsage,
  isDeclaredType,
  addDeclaredType,
} from "./variable-validation";
import { addDeclaredType } from "./variable-validation";

// Track variable types for cross-variable assignment validation
const variableTypes = new Map<string, string>();

export function getVariableType(name: string): string | undefined {
  return variableTypes.get(name);
}

export function setVariableType(name: string, type: string): void {
  variableTypes.set(name, type);
}

export function clearVariableTypes(): void {
  variableTypes.clear();
}

/**
 * Parse a type declaration: type TypeName = TypeValue;
 * Returns the type name and next index
 */
export function parseTypeDeclaration(
  source: string,
  startIndex: number,
): { nextIndex: number; typeName: string } {
  let i = startIndex + 4; // skip 'type'
  while (i < source.length && isWhitespace(source[i])) i++;
  const nameStart = i;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  const typeName = source.slice(nameStart, i);
  if (!typeName) throw new Error("Expected type name after type");
  // Skip to semicolon
  while (i < source.length && source[i] !== ";") i++;
  if (i < source.length && source[i] === ";") i++;
  addDeclaredType(typeName);
  return { nextIndex: i, typeName };
}

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

  // Handle pointer prefix: * or *mut
  if (source[index] === "*") {
    index++;
    while (index < source.length && isWhitespace(source[index])) index++;
    // Check for 'mut' after *
    if (matchWord(source, index, "mut")) {
      index += 3;
      while (index < source.length && isWhitespace(source[index])) index++;
    }
  }

  // Handle array type: [Type; N; M]
  if (source[index] === "[") {
    let depth = 1;
    index++;
    while (index < source.length && depth > 0) {
      if (source[index] === "[") depth++;
      else if (source[index] === "]") depth--;
      index++;
    }
  } else {
    while (
      index < source.length &&
      (isIdentifierChar(source[index]) || source[index] === "*")
    )
      index++;
  }
  const type = source.slice(typeStart, index).trim();
  return { type, nextIndex: index };
}

function processInitializer(
  source: string,
  startIdx: number,
  typeAnnotation: string | undefined,
): {
  i: number;
  isArray: boolean;
  hasInit: boolean;
  inferredType: string | undefined;
} {
  let i = startIdx;
  if (i >= source.length || source[i] !== "=")
    return { i, isArray: false, hasInit: false, inferredType: undefined };
  i++;
  while (i < source.length && isWhitespace(source[i])) i++;
  const isArrayDetected = source[i] === "[";
  const { content: value, endIdx: valueEndIdx } = parseUntilSemicolon(
    source,
    i,
  );
  i = valueEndIdx;
  const trimmedValue = value.trim();
  const sourceVarType = getVariableType(trimmedValue);
  if (typeAnnotation) {
    if (sourceVarType)
      validateTypeSuffixCompatibility(sourceVarType, typeAnnotation);
    validateTypeAnnotation(value, typeAnnotation);
  }
  const type = inferValueType(value);
  return { i, isArray: isArrayDetected, hasInit: true, inferredType: type };
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
  isArray?: boolean;
  hasInitializer?: boolean;
  inferredType?: string;
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
  const {
    i: afterInit,
    isArray: initArray,
    hasInit,
    inferredType,
  } = processInitializer(source, i, typeAnnotation);
  i = afterInit;
  const isArray =
    initArray ||
    typeAnnotation?.startsWith("[") ||
    typeAnnotation?.startsWith("*[");
  if (i < source.length && source[i] === ";") i++;
  const effectiveType = typeAnnotation || inferredType;
  if (effectiveType) setVariableType(varName, effectiveType);
  return {
    nextIndex: i,
    varName,
    typeAnnotation,
    isMutable,
    isArray,
    hasInitializer: hasInit,
    inferredType,
  };
}
