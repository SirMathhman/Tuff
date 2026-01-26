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
  const out: string[] = [];
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
      // Remove preceding whitespace
      while (out.length > 0 && isWhitespace(out[out.length - 1])) out.pop();
      // Remove the preceding identifier (the expression being checked)
      while (out.length > 0 && isIdentifierChar(out[out.length - 1])) out.pop();
      // Skip the 'is' keyword and whitespace
      let j = i + 2;
      while (j < source.length && isWhitespace(source[j])) j++;
      // Skip the type name
      while (j < source.length && isIdentifierChar(source[j])) j++;
      // Replace with 1 (true)
      out.push("1");
      i = j;
    } else {
      out.push(source[i]!);
      i++;
    }
  }

  return out.join("");
}
