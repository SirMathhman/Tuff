/**
 * Evaluates a numeric string expression.
 * An empty (or whitespace-only) input evaluates to 0.
 */
export function evaluate(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") {
    return 0;
  }
  const value = Number(trimmed);
  if (Number.isNaN(value)) {
    throw new Error(`Cannot evaluate: "${input}"`);
  }
  return value;
}
