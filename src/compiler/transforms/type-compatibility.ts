import { isNumericLiteral } from "../validation/validation";

/**
 * Shared type compatibility checks for struct and function validation
 */
export function isTypeCompatible(value: string, expectedType: string): boolean {
  const trimmed = value.trim();

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
