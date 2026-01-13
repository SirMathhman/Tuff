export function interpret(input: string): number {
  // Basic interpretation: coerce the string into a number
  const result = Number(input);
  if (Number.isNaN(result)) {
    throw new Error(`Invalid numeric string: ${input}`);
  }
  // Truncate fractional part toward zero
  return Math.trunc(result);
}
