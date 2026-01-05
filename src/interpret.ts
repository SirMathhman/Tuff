export function interpret(input: string): number {
  // Simple numeric parser: convert string to number and return it.
  // Throws if the input is not a finite number.
  const n = Number(input);
  if (Number.isFinite(n)) {
    return n;
  }
  throw new Error("interpret: input is not a number");
}
