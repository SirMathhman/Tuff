export function interpret(input: string): number {
  // Basic interpretation: coerce the string into a number
  // This returns NaN for non-numeric inputs, as expected
  return Number(input);
}
