/**
 * Entry point for the Tuff compiler.
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Evaluates a source expression.
 *
 * @param source - The source expression to evaluate.
 * @returns 0 for empty or whitespace-only input.
 * @throws {Error} For any other input (not implemented yet).
 */
export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") {
    return 0;
  }
  const value = Number(trimmed);
  if (Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Not implemented: ${source}`);
}
