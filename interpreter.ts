/**
 * Compiles source code.
 * @param source - The source code to compile
 * @returns The compiled code
 */
function compile(source: string): string {
  // TODO: Implement compilation logic
  return source;
}

/**
 * Interprets source code by compiling and evaluating it.
 * @param source - The source code to interpret
 * @returns The exit code (number result of the compiled code)
 */
function interpret(source: string): number {
  const compiled = compile(source);
  return eval(compiled) as number;
}

export { interpret, compile };
