/**
 * Interpret a string and return a number.
 * Current implementation parses a leading numeric prefix and allows trailing text
 * only for non-negative numbers. If a negative number has trailing text, an
 * Error is thrown.
 * TODO: extend to support expressions or other formats.
 */
export function interpret(input: string): number {
  // Trim whitespace and parse a leading numeric value. If not a valid number, return NaN.
  const trimmed = input.trim();
  if (trimmed === "") return NaN;

  // Match a leading numeric token (including decimals and exponents) and capture any trailing characters
  const m = trimmed.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(.*)$/);
  if (!m) return NaN;

  const numStr = m[1];
  const rest = m[2] || "";
  const value = Number(numStr);
  if (!Number.isFinite(value)) return NaN;

  if (rest === "") return value;

  // If there is trailing text after a negative number, consider it an error
  if (numStr.startsWith("-")) {
    throw new Error("Invalid trailing characters after negative number");
  }

  // Otherwise accept the leading numeric prefix
  return value;
}
