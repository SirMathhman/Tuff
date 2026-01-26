import { isIdentifierChar, isWhitespace } from "./string-helpers";

export type ParamInfo = {
  name: string;
  type: string;
};

/**
 * Helper: Skip to comma or end, handling nested parentheses in function types
 * Returns the index where parsing should resume
 */
function skipToNextParam(rawParams: string, startIndex: number): number {
  let j = startIndex;
  let nestedParenDepth = 0;
  while (j < rawParams.length) {
    if (rawParams[j] === "(") nestedParenDepth++;
    else if (rawParams[j] === ")") {
      if (nestedParenDepth === 0) break;
      nestedParenDepth--;
    } else if (rawParams[j] === "," && nestedParenDepth === 0) break;
    j++;
  }
  if (j < rawParams.length && rawParams[j] === ",") j++;
  return j;
}

/**
 * Helper: Parse parameter name and apply transformations
 * Returns parameter name and updated index
 */
function parseParamName(
  rawParams: string,
  startIndex: number,
): {
  name: string;
  nextIndex: number;
} {
  let j = startIndex;
  const pStart = j;
  while (j < rawParams.length && isIdentifierChar(rawParams[j])) j++;
  let paramName = rawParams.slice(pStart, j);
  if (paramName === "this") paramName = "thisVal";
  return { name: paramName, nextIndex: j };
}

/**
 * Generic parameter parser that handles common parsing logic
 */
function parseParams<T>(
  rawParams: string,
  onParam: (name: string, typeStr: string | undefined) => T,
): T[] {
  const results: T[] = [];
  const seen = new Set<string>();
  let j = 1; // Skip opening (

  while (j < rawParams.length - 1) {
    if (isWhitespace(rawParams[j])) {
      j++;
      continue;
    }

    if (isIdentifierChar(rawParams[j])) {
      const { name: paramName, nextIndex } = parseParamName(rawParams, j);

      if (seen.has(paramName)) {
        throw new Error(`duplicate parameter name: ${paramName}`);
      }
      seen.add(paramName);

      j = nextIndex;
      // Skip whitespace to colon
      while (j < rawParams.length && isWhitespace(rawParams[j])) j++;

      let typeStr: string | undefined;
      // Expect colon
      if (j < rawParams.length && rawParams[j] === ":") {
        j++;
        while (j < rawParams.length && isWhitespace(rawParams[j])) j++;

        // Extract type
        const typeStart = j;
        j = skipToNextParam(rawParams, j);
        const typeEnd = j > 0 && rawParams[j - 1] === "," ? j - 1 : j;
        typeStr = rawParams.slice(typeStart, typeEnd).trim();
      } else {
        j = skipToNextParam(rawParams, j);
      }

      results.push(onParam(paramName, typeStr));
    } else {
      j++;
    }
  }

  return results;
}

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
  return parseParams(rawParams, (name) => name);
}

/**
 * Extract parameter names and types from a raw parameter string like "(a : I32, b : I32)".
 * Returns an array of parameter information including names and types.
 */
export function extractParamsWithTypes(rawParams: string): ParamInfo[] {
  return parseParams(rawParams, (name, type) => ({
    name,
    type: type || "",
  }));
}
