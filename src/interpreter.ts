/**
 * Stubbed compiler and interpreter utilities
 *
 * Note: `interpret` uses `eval`. Only pass trusted input.
 */

/**
 * Compile a source string to JavaScript. (Stubbed)
 * @param source - source string to compile
 * @returns compiled JavaScript as a string
 */
export function compile(source: string): string {
  // TODO: implement actual compilation logic
  return source;
}

/**
 * Interpret a source string by compiling and evaluating it.
 * @param source - source string to interpret
 * @returns numeric result of evaluating the compiled source
 */
export function interpret(source: string): number {
  // eslint-disable-next-line no-eval
  const value = eval(compile(source));
  return Number(value);
}
