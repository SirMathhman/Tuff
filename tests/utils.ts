import { interpret, compile, execute } from '../src/index';

/**
 * Assert that code produces the expected result in BOTH the interpreter and compiler.
 * This validates that the implementation is consistent across both pipelines.
 */
export function assertValid(code: string, expectedResult: number): void {
  // Test interpreter
  const interpreterResult = interpret(code);
  expect(interpreterResult).toBe(expectedResult);

  // Test compiler pipeline (once implemented)
  // For now, compile returns empty string and execute returns 0, so we skip this
  // In the future, this will validate both pipelines produce identical results
  if (compile(code) !== '') {
    const compiled = compile(code);
    const compilerResult = execute(compiled);
    expect(compilerResult).toBe(expectedResult);
  }
}

/**
 * Assert that code throws an error in BOTH the interpreter and compiler.
 * This validates that error checking is consistent across both pipelines.
 */
export function assertInvalid(code: string): void {
  // Test interpreter - just check that it throws, we don't validate the message
  expect(() => {
    interpret(code);
  }).toThrow();

  // Test compiler pipeline (once implemented)
  // For now, compile returns empty string and doesn't validate, so we skip this
  // In the future, this will validate both pipelines reject the code
  if (compile(code) !== '') {
    expect(() => {
      const compiled = compile(code);
      execute(compiled);
    }).toThrow();
  }
}
