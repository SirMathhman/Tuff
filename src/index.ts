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
  if (source.trim() === "") {
    return 0;
  }
  throw new Error(`Not implemented: ${source}`);
}
