export function interpret(input: string): number {
  // Simple numeric interpreter: convert input to number and validate
  const value = Number(input);
  if (Number.isNaN(value)) {
    throw new Error('Invalid numeric input');
  }
  return value;
}
