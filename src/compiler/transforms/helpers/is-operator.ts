import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
} from "../../parsing/string-helpers";

/**
 * Transform 'is' type check operator to 1 (true)
 * Type checking happens at compile time, so runtime is always true
 * e.g., "x is I32" -> "1" (whole expression becomes 1)
 */
export function transformIsOperator(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    // Look for ' is ' pattern (with spaces)
    if (
      matchWord(source, i, "is") &&
      i > 0 &&
      (isWhitespace(source[i - 1]) || source[i - 1] === ")") &&
      i + 2 < source.length &&
      isWhitespace(source[i + 2])
    ) {
      // Remove preceding whitespace from result
      while (result.length > 0 && isWhitespace(result[result.length - 1])) {
        result = result.slice(0, -1);
      }
      // Find and remove the preceding identifier (the expression being checked)
      let exprEnd = result.length;
      while (exprEnd > 0 && isIdentifierChar(result[exprEnd - 1])) {
        exprEnd--;
      }
      result = result.slice(0, exprEnd);
      // Skip the 'is' keyword and whitespace
      let j = i + 2;
      while (j < source.length && isWhitespace(source[j])) j++;
      // Skip the type name
      while (j < source.length && isIdentifierChar(source[j])) j++;
      // Replace with 1 (true)
      result += "1";
      i = j;
    } else {
      result += source[i];
      i++;
    }
  }

  return result;
}
