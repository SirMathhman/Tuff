/**
 * Interpret the given input string and return a numeric result.
 *
 * Supports numeric literals with optional type suffixes (e.g., "100U8", "42I32").
 */
export function interpret(input: string): number {
  // Match numeric part followed by optional type suffix
  const match = input.match(/^(-?\d+(?:\.\d+)?)\s*([A-Za-z]\w*)?$/);
  
  if (!match) {
    throw new Error(`Invalid number: ${input}`);
  }

  const value = Number(match[1]);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid number: ${input}`);
  }

  return value;
}
