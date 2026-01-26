import { isIdentifierChar, isWhitespace } from "./string-helpers";

export type ParamInfo = {
  name: string;
  type: string;
};

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

/**
 * Extract parameter names and types from a raw parameter string like "(a : I32, b : I32)".
 * Returns an array of parameter information including names and types.
 */
export function extractParamsWithTypes(rawParams: string): ParamInfo[] {
  const params: ParamInfo[] = [];
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

      // Skip whitespace to colon
      while (j < rawParams.length && isWhitespace(rawParams[j])) j++;

      // Expect colon
      if (j < rawParams.length && rawParams[j] === ":") {
        j++;
        while (j < rawParams.length && isWhitespace(rawParams[j])) j++;

        // Extract type
        const typeStart = j;
        let nestedParenDepth = 0;
        while (j < rawParams.length) {
          if (rawParams[j] === "(") nestedParenDepth++;
          else if (rawParams[j] === ")") {
            if (nestedParenDepth === 0) break;
            nestedParenDepth--;
          } else if (rawParams[j] === "," && nestedParenDepth === 0) break;
          j++;
        }

        const type = rawParams.slice(typeStart, j).trim();
        params.push({ name: paramName, type });

        // Skip comma if present
        if (j < rawParams.length && rawParams[j] === ",") {
          j++;
        }
      }
    } else {
      j++;
    }
  }

  return params;
}
