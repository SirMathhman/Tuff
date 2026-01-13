export function interpret(input: string): number {
  const trimmed = input.trim();
  if (trimmed.startsWith("-") && /U\d*$/i.test(trimmed)) {
    throw new Error("Unsigned integer cannot be negative");
  }
  return parseFloat(trimmed);
}
