import { interpret, execute } from '../src/index';

/**
 * Assert that code produces the expected result in BOTH the interpreter and compiler.
 * This validates that the implementation is consistent across both pipelines.
 */
export function assertValid(code: string, expectedResult: number): void {
  // Test interpreter
  const interpreterResult = interpret(code);
  expect(interpreterResult).toBe(expectedResult);

  // Test compiler pipeline
  const compilerResult = execute(code);
  expect(compilerResult).toBe(expectedResult);
}

/**
 * Assert that code throws an error in BOTH the interpreter and compiler.
 * This validates that error checking is consistent across both pipelines.
 */
export function assertInvalid(code: string): void {
  // Test interpreter - check that it throws
  expect(() => {
    interpret(code);
  }).toThrow();

  // Test compiler pipeline - check that it throws
  expect(() => {
    execute(code);
  }).toThrow();
}
