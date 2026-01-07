/**
 * Compile a string into JavaScript source that evaluates to a number
 */
export function compile(input: string): string {
  // Recognize `read<I32>()` which should read a signed 32-bit integer from
  // the provided `stdin` string. The compiled expression references a
  // `stdin` variable that will be injected by `run` when evaluating.
  if (/^\s*read<\s*I32\s*>\s*\(\s*\)\s*$/.test(input)) {
    return 'parseInt(stdin, 10)';
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
  // string literal.
  const code = `(function(){ const stdin = ${JSON.stringify(stdin)}; return (${compiledExpr}); })()`;

  // eslint-disable-next-line no-eval
  const result = eval(code);
  return Number(result);
}
