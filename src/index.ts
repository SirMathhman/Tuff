/**
 * Evaluates a Tuff expression.
 *
 * @param input - The expression to evaluate.
 * @returns The numeric result. An empty (or whitespace-only) expression
 *          evaluates to 0.
 */
export function evaluate(input: string): number {
  if (input.trim() === "") {
    return 0;
  }

  throw new Error(`Unsupported expression: ${JSON.stringify(input)}`);
}
