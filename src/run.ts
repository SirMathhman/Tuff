/**
 * Compile a string into JavaScript source that evaluates to a number
 */
export function compile(input: string): string {
  // For now, compile returns a literal expression of the string length.
  // Example: input 'abc' -> '(3)'
  return `(${input.length})`;
}

/**
 * run - takes a string and returns a number
 * Implementation: compile the input to JS, eval it, and return the result.
 */
export function run(input: string): number {
  // Call the exported `compile` to allow runtime spies/mocks to intercept it.
  // Using `exports` keeps the function as a named export while still enabling
  // `jest.spyOn` to replace it at runtime for tests.
  const code = (exports as any).compile(input);
  // eslint-disable-next-line no-eval
  const result = eval(code);
  return Number(result);
}
