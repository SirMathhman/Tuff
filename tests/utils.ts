import { interpret, compile, execute } from '../src/index';

// USER SAYS: DO NOT TOUCH THIS FILE

/**
 * Assert that code produces the expected result in BOTH the interpreter and compiler.
 * This validates that the implementation is consistent across both pipelines.
 */
export function assertValid(code: string, expectedResult: number): void {
  // Test interpreter
  const interpreterResult = interpret(code);
  expect(interpreterResult).toBe(expectedResult);

  const compiled = compile(code);
  try {
    const compilerResult = execute(compiled);
    expect(compilerResult).toBe(expectedResult);
  } catch (e) {
    throw new Error("Compiled code of '" + compiled + "' threw an error: " + (e as Error).message);
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

  expect(() => {
    const compiled = compile(code);
    execute(compiled);
  }).toThrow();
}
