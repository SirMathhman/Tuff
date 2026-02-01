/**
 * Stubbed function to compile Tuff source to JavaScript.
 *
 * @param source - Tuff source code as a string
 * @returns JavaScript output as a string (stubbed)
 */
export function compileTuffToJS(source: string): string {
  // Reject negative numbers with type annotations (e.g., "-100U8")
  if (/-[0-9]+[A-Z][0-9]*/.test(source)) {
    throw new Error('Type annotations are not allowed on negative numeric literals');
  }

  // Remove type annotations (e.g., "100U8" -> "100")
  const compiled = source.replace(/([0-9]+)[A-Z][0-9]*/g, '$1');
  return `return ${compiled}`;
}
