import { isNumericLiteral } from "../../compiler/validation/validation";

/**
 * Infer the concrete type of a value based on its literal representation
 * Used by both compiler and interpreter for generic type validation
 */
export function inferValueType(value: string): string | undefined {
  const trimmed = value.trim();

  // Boolean literals
  if (trimmed === "true" || trimmed === "false") {
    return "Bool";
  }

  // Numeric literals - check for type suffix
  if (isNumericLiteral(trimmed)) {
    // Check for type suffix (U8, I32, etc.)
    for (let i = trimmed.length - 1; i >= 0; i--) {
      const c = trimmed[i];
      if (c && c >= "0" && c <= "9") {
        break; // Found last digit
      }
      if (c === "U" || c === "I") {
        // Found type suffix, extract it
        const suffix = trimmed.slice(i);
        // Check if suffix matches pattern [UI][0-9]+
        let isValidSuffix = true;
        if (suffix.length < 2) {
          isValidSuffix = false;
        } else {
          for (let j = 1; j < suffix.length; j++) {
            const ch = suffix[j];
            if (!ch || ch < "0" || ch > "9") {
              isValidSuffix = false;
              break;
            }
          }
        }
        if (isValidSuffix) {
          return suffix;
        }
        break;
      }
    }
    // No suffix, default to I32
    return "I32";
  }

  // Can't determine type from literal
  return undefined;
}
