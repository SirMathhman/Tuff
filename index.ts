/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score.
 */
export function evaluateTuff(s: string): number {
  try {
    const result = new Function(s)();
    return typeof result === "number" ? result : 0;
  } catch {
    return 0;
  }
}
