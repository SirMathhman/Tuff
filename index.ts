/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score.
 */
export function evaluateTuff(s: string): number {
  const match = s.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}
