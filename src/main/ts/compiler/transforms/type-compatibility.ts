import { isNumericLiteral } from "../validation/validation";
import {
  isIdentifierStartChar,
  isIdentifierChar,
} from "../parsing/string-helpers";
import { getTypeAlias } from "../parsing/parser-utils";

function resolveAliasChain(typeName: string): string {
  let current = typeName.trim();
  for (let i = 0; i < 16; i++) {
    const next = getTypeAlias(current);
    if (!next || next === current) break;
    current = next.trim();
  }
  return current;
}

/**
 * Shared type compatibility checks for struct and function validation
 */
export function isTypeCompatible(
  value: string,
  _expectedType: string,
): boolean {
  const trimmed = value.trim();

  const expectedType = resolveAliasChain(_expectedType);

  // Handle union types (A | B | C) by checking each option
  if (expectedType.includes("|")) {
    const parts = expectedType.split("|").map((p) => p.trim());
    for (const part of parts) {
      if (part && isTypeCompatible(trimmed, part)) return true;
    }
    return false;
  }

  // Handle pointer types
  if (expectedType.startsWith("*")) {
    // For pointer parameters, accept reference expressions or pointer variables
    return isPointerTypeValueCompatible(trimmed, expectedType);
  }

  // If the value is a numeric literal, check if it fits the type
  if (isNumericLiteral(trimmed)) {
    // For Bool type, numeric literals are not compatible
    if (expectedType === "Bool") {
      return false;
    }

    // For numeric types (I32, U8, etc.), plain numbers are compatible
    if (expectedType.startsWith("I") || expectedType.startsWith("U")) {
      return true;
    }
  }

  // If it's a boolean literal (true/false) and target is Bool, it's compatible
  if ((trimmed === "true" || trimmed === "false") && expectedType === "Bool") {
    return true;
  }

  return false;
}

/**
 * Check if a value is compatible with a pointer type parameter
 * Accepts: &variable, pointer_variable, &array
 */
function isPointerTypeValueCompatible(
  value: string,
  _expectedType: string,
): boolean {
  const trimmed = value.trim();

  // Accept reference expressions (&x)
  if (trimmed.startsWith("&")) {
    return true;
  }

  // Accept pointer variables (assuming they're already validated elsewhere)
  // Check if it's a valid identifier
  if (isValidIdentifier(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Check if a string is a valid identifier
 */
function isValidIdentifier(str: string): boolean {
  if (str.length === 0) return false;
  if (!isIdentifierStartChar(str[0])) return false;
  for (let i = 1; i < str.length; i++) {
    if (!isIdentifierChar(str[i])) return false;
  }
  return true;
}
