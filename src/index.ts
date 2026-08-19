/**
 * Evaluate an expression.
 * @param expression - The expression to evaluate.
 * @returns The numeric result of the expression.
 */
export function evaluate(expression: string): number {
  // Stub: handles `return <number>;` statements; returns 0 otherwise.
  const match = /^\s*return\s+(-?\d+(?:\.\d+)?)\s*;\s*$/.exec(expression);
  if (!match) {
    return 0;
  }
  return Number(match[1]);
}
