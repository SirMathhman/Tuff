/**
 * Compiles source code.
 * @param source - The source code to compile
 * @returns The compiled code
 */
function compile(source: string): string {
  // Wrap in a function to allow 'let' declarations and return the last expression
  const lastStatement = source.split(';').pop()?.trim() || source;
  return `(function() { ${source}; return ${lastStatement}; })()`;
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
