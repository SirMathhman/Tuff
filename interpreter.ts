/**
 * Compiles source code.
 * @param source - The source code to compile
 * @returns The compiled code
 */
function compile(source: string): string {
  // Return the source as-is; eval will handle it in a non-strict context
  return source;
}

/**
 * Interprets source code by compiling and evaluating it.
 * @param source - The source code to interpret
 * @returns The exit code (number result of the compiled code)
 */
function interpret(source: string): number {
  const compiled = compile(source);
  // Use eval in a function context to allow 'let' declarations
  // eslint-disable-next-line no-eval
  return (function() { return eval(compiled); }).call({}) as number;
}

export { interpret, compile };
