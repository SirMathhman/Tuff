/**
 * Interpret the given string and return a numeric result.
 *
 * Minimal implementation: parse a numeric string and simple `a + b` expressions.
 */
export function interpret(input: string): number {
  const trimmed = input.trim();

  // Minimal multi-term addition support: split on '+' and sum the numeric parts.
  const plusParts = trimmed.split("+").map((p) => p.trim());
  if (plusParts.length > 1) {
    return plusParts.reduce((acc, part) => acc + Number(part), 0);
  }

  // Default: coerce to number
  return Number(trimmed);
}
