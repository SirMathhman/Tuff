/**
 * Compile a string into JavaScript source that evaluates to a number
 */
export function compile(input: string): string {
  // Replace all occurrences of `read<I32>()` with calls to a runtime helper
  // function `readI32()` which `run` will provide when evaluating.
  const readRegex = /read<\s*I32\s*>\s*\(\s*\)/g;
  if (readRegex.test(input)) {
    return input.replace(readRegex, 'readI32()');
  }

  // For now, compile returns a literal expression of the string length.
  // Example: input 'abc' -> '(3)'
  return `(${input.length})`;
}

/**
 * run - takes a string and returns a number
 * Implementation: compile the input to JS, eval it, and return the result.
 */
export function run(input: string, stdin: string = ""): number {
  // Call the exported `compile` to allow runtime spies/mocks to intercept it.
  const compiledExpr = (exports as any).compile(input);

  // Wrap the compiled expression in an IIFE so we can inject `stdin` into
  // the evaluation scope. JSON.stringify is used to safely embed the stdin
  // string literal. We also provide a `readI32` helper that consumes tokens
  // from `stdin` (split on whitespace) so expressions like
  // "read<I32>() + read<I32>()" work as expected.
  const code = `(function(){ const stdin = ${JSON.stringify(stdin)}; const args = stdin.trim() ? stdin.trim().split(/\\s+/) : []; let __readIndex = 0; function readI32(){ return parseInt(args[__readIndex++], 10); } return (${compiledExpr}); })()`;

  // eslint-disable-next-line no-eval
  const result = eval(code);
  return Number(result);
}
