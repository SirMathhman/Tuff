/**
 * Evaluate the tuffness of a string.
 *
 * @param input - The string to evaluate.
 * @returns The tuffness score.
 */
export function evaluateTuff(input: string): number {
  const match = /^return\s+(-?\d+(?:\.\d+)?)\s*;?$/.exec(input);
  return match ? Number(match[1]) : 0;
}
