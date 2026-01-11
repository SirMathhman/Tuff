/**
 * Interpret a string and return a number.
 * Current minimal implementation parses numeric strings using Number().
 * TODO: extend to support expressions or other formats.
 */
export function interpret(input: string): number {
  // Trim whitespace and convert to number. If not a valid number, return NaN.
  const trimmed = input.trim();
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : NaN;
}
