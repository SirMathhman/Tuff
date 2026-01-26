import { isIdentifierChar, isWhitespace } from "./string-helpers";

/**
 * Extract parameter names from a raw parameter string like "(a : I32, b : I32)".
 * Returns an array of parameter names.
 * Handles:
 * - Type annotations (skipped)
 * - Nested parentheses in function types
 * - 'this' parameter (converted to 'thisVal')
 * - Validates no duplicate parameter names
 */
export function extractParamNamesFromRaw(rawParams: string): string[] {
  const params: string[] = [];
  const seen = new Set<string>();
  let j = 1; // Skip opening (
  while (j < rawParams.length - 1) {
    if (isWhitespace(rawParams[j])) {
      j++;
      continue;
    }
    if (isIdentifierChar(rawParams[j])) {
      const pStart = j;
      while (j < rawParams.length && isIdentifierChar(rawParams[j])) j++;
      let paramName = rawParams.slice(pStart, j);
      if (paramName === "this") paramName = "thisVal";
      if (seen.has(paramName)) {
        throw new Error(`duplicate parameter name: ${paramName}`);
      }
      seen.add(paramName);
      params.push(paramName);
      // Skip to comma or end, handling nested parentheses in function types
      let nestedParenDepth = 0;
      while (j < rawParams.length) {
        if (rawParams[j] === "(") nestedParenDepth++;
        else if (rawParams[j] === ")") {
          if (nestedParenDepth === 0) break;
          nestedParenDepth--;
        } else if (rawParams[j] === "," && nestedParenDepth === 0) break;
        j++;
      }
      if (rawParams[j] === ",") j++;
    } else {
      j++;
    }
  }
  return params;
}
