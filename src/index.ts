/**
 * Evaluates a Tuff expression.
 *
 * @param input - The expression to evaluate.
 * @returns The numeric result. An empty (or whitespace-only) expression
 *          evaluates to 0. Numeric literals evaluate to their value.
 */
export function evaluate(input: string): number {
  const trimmed = input.trim();

  if (trimmed === "") {
    return 0;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  throw new Error(`Unsupported expression: ${JSON.stringify(input)}`);
}
