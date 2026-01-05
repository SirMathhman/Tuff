/**
 * Interpret the given string and return a numeric result.
 *
 * Minimal implementation: parse a numeric string and simple `a + b` expressions.
 */
export function interpret(input: string): number {
  const trimmed = input.trim();

  // Very small step: support addition of two numbers like `1 + 2` or `1+2`
  const addMatch = trimmed.match(
    /^(-?\d+(?:\.\d+)?)\s*\+\s*(-?\d+(?:\.\d+)?)$/
  );
  if (addMatch) {
    const a = Number(addMatch[1]);
    const b = Number(addMatch[2]);
    return a + b;
  }

  // Default: coerce to number
  return Number(trimmed);
}
