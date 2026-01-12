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
