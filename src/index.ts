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

  if (rest.length > 0) {
    // Only allow exact 'U8' suffix (case-sensitive) and only when numericPart is integer
    if (rest !== "U8") {
      throw new Error(`Invalid numeric string: ${input}`);
    }
    if (numericPart.includes(".")) {
      throw new Error(`Invalid numeric string: ${input}`);
    }
  }

  const num = Number(numericPart);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid numeric string: ${input}`);
  }

  // If suffix is 'U8', only allow non-negative integers (lower bound 0)
  if (rest === 'U8' && num < 0) {
    throw new Error(`Invalid numeric string: ${input}`);
  }

  // Truncate fractional part toward zero
  return Math.trunc(num);
}
