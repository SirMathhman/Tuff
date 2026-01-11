/**
 * Interpret a string and return a number.
 * Current minimal implementation parses a leading numeric prefix using parseFloat.
 * TODO: extend to support expressions or other formats.
 */
export function interpret(input: string): number {
  // Trim whitespace and parse a leading numeric value. If not a valid number, return NaN.
  const trimmed = input.trim();
  if (trimmed === "") return NaN;

  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}
