export function interpret(input: string): number {
  // If the input is a numeric string (e.g., "100", "3.14", "-2"), parse and return its numeric value.
  const trimmed = input.trim();
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }

  // Fallback: return the length of the input string
  return input.length;
}
