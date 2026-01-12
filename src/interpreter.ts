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
  // Very small stub compiler: support numeric literals with unsigned suffixes like `U8`.
  // Example: `100U8` -> `100`
  const s = source.trim();
  // eslint-disable-next-line no-restricted-syntax -- regex used intentionally for small literal parsing
  const u8 = s.match(/^([0-9]+)U8$/i);
  if (u8) return u8[1];

  // Default: return the source unchanged (assume valid JS/expr)
  return source;
}

/**
 * Interpret a source string by compiling and evaluating it with provided stdin.
 * @param source - source string to interpret
 * @param stdIn - standard input string made available to the evaluated code (optional)
 * @returns numeric result of evaluating the compiled source
 */
export function interpret(source: string, stdIn: string = ""): number {
  const compiled = compile(source);

  // First try treating the compiled output as an expression so we can return its value.
  try {
    // eslint-disable-next-line no-eval
    const value = eval(
      `(function(stdIn){ return (${compiled}) })(${JSON.stringify(stdIn)})`
    );
    return Number(value);
  } catch {
    // If treating it as an expression fails (e.g., because it's statements), execute it as statements.
    // eslint-disable-next-line no-eval
    const value = eval(
      `(function(stdIn){ ${compiled} })(${JSON.stringify(stdIn)})`
    );
    return Number(value);
  }
}
