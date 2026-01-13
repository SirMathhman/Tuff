export function interpret(input: string): number {
  // Parse a leading numeric prefix (allowing optional sign and decimals)
  // Examples: "100" -> 100, "100U8" -> 100, "3.14abc" -> 3
  const match = input.trim().match(/^([+-]?\d+(?:\.\d+)?)/);
  if (!match) {
    throw new Error(`Invalid numeric string: ${input}`);
  }
  const num = Number(match[1]);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid numeric string: ${input}`);
  }
  // Truncate fractional part toward zero
  return Math.trunc(num);
}
