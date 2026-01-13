export function interpret(input: string): number {
  // Input must start with the numeric characters (no trimming of leading whitespace).
  // Allow integer prefixes with suffixes (e.g., "100U8" -> 100) but disallow
  // suffixes when the numeric part is a float (e.g., "3.99kg" should be invalid).
  const match = input.match(/^([+-]?\d+(?:\.\d+)?)(.*)$/);
  if (!match) {
    throw new Error(`Invalid numeric string: ${input}`);
  }
  const numericPart = match[1];
  const rest = match[2];

  // If there is a suffix and the numeric part is a float, that's invalid.
  if (rest.length > 0 && numericPart.includes('.')) {
    throw new Error(`Invalid numeric string: ${input}`);
  }

  const num = Number(numericPart);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid numeric string: ${input}`);
  }

  // Truncate fractional part toward zero
  return Math.trunc(num);
}
