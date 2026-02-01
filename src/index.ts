/**
 * Stubbed function to compile Tuff source to JavaScript.
 *
 * @param source - Tuff source code as a string
 * @returns JavaScript output as a string (stubbed)
 */
export function compileTuffToJS(source: string): string {
  // Remove type annotations (e.g., "100U8" -> "100")
  const compiled = source.replace(/([0-9]+)[A-Z][0-9]*/g, '$1');
  return `return ${compiled}`;
}
