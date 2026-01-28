/**
 * Interpret the given input string and return a numeric result.
 *
 * Supports numeric literals with optional type suffixes (e.g., "100U8", "42I32").
 * Negative numbers cannot have type suffixes.
 */
export function interpret(input: string): number {
  // Match numeric part followed by optional type suffix
  const match = input.match(/^(-?\d+(?:\.\d+)?)\s*([A-Za-z]\w*)?$/);

  if (!match) {
    throw new Error(`Invalid number: ${input}`);
  }

  const number = match[1];
  const typeSuffix = match[2];

  // Negative numbers cannot have type suffixes
  if (number.startsWith('-') && typeSuffix) {
    throw new Error(`Invalid number: ${input}`);
  }

  const value = Number(number);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid number: ${input}`);
  }

  return value;
}
