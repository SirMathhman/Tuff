import { isNumericLiteral } from "../validation/validation";
import {
  isIdentifierStartChar,
  isIdentifierChar,
} from "../parsing/string-helpers";

/**
 * Shared type compatibility checks for struct and function validation
 */
export function isTypeCompatible(
  value: string,
  _expectedType: string,
): boolean {
  const trimmed = value.trim();

  // Handle pointer types
  if (_expectedType.startsWith("*")) {
    // For pointer parameters, accept reference expressions or pointer variables
    return isPointerTypeValueCompatible(trimmed, _expectedType);
  }

  // If the value is a numeric literal, check if it fits the type
  if (isNumericLiteral(trimmed)) {
    // For Bool type, numeric literals are not compatible
    if (_expectedType === "Bool") {
      return false;
    }

    // For numeric types (I32, U8, etc.), plain numbers are compatible
    if (_expectedType.startsWith("I") || _expectedType.startsWith("U")) {
      return true;
    }
  }

  // If it's a boolean literal (true/false) and target is Bool, it's compatible
  if ((trimmed === "true" || trimmed === "false") && _expectedType === "Bool") {
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
