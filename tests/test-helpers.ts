import { expect, test as it } from "bun:test";
import { interpret, interpretAll } from "../src/utils/interpret";
import { compile, evalImpl } from "../src/compiler/compiler";

/**
 * Assert that an interpretation is valid and returns the expected value.
 * @param code The code to interpret
 * @param expectedValue The expected result
 */
export function assertInterpretValid(
  code: string,
  expectedValue: number,
): void {
  expect(interpret(code)).toBe(expectedValue);
}

/**
 * Assert that an interpretation throws an error.
 * @param code The code to interpret
 */
export function assertInterpretInvalid(code: string): void {
  expect(() => interpret(code)).toThrow();
}

/**
 * Assert that interpretAll is valid and returns the expected value.
 * @param entry The entry point
 * @param config The module configuration
 * @param nativeConfig Optional native configuration
 * @param expectedValue The expected result
 */
export function assertInterpretAllValid(
  entry: string[],
  config: Map<string[], string>,
  expectedValue: number,
  nativeConfig?: Map<string[], string>,
): void {
  const result = interpretAll(entry, config, nativeConfig);
  expect(result).toBe(expectedValue);
}

/**
 * Assert that interpretAll throws an error.
 * @param entry The entry point
 * @param config The module configuration
 * @param nativeConfig Optional native configuration
 */
export function assertInterpretAllInvalid(
  entry: string[],
  config: Map<string[], string>,
  nativeConfig?: Map<string[], string>,
): void {
  expect(() => interpretAll(entry, config, nativeConfig)).toThrow();
}

export function assertExecuteValid(source: string, expected: number): void {
  const compiled = compile(source);
  try {
    const result = evalImpl(compiled);
    expect(result).toBe(expected);
  } catch {
    throw new Error("Failed to execute compiled code: " + compiled);
  }
}

// Test helper for compile-time validation errors
export function assertCompileInvalid(source: string): void {
  expect(() => compile(source)).toThrow();
}

type AssertValid = (source: string, expected: number) => void;
type AssertInvalid = (source: string) => void;

export function itBoth(
  name: string,
  fn: (assertValid: AssertValid, assertInvalid: AssertInvalid) => void,
) {
  it("Interpreted: " + name, () =>
    fn(assertInterpretValid, assertInterpretInvalid),
  );
  it("Compiled: " + name, () => fn(assertExecuteValid, assertCompileInvalid));
}
export function itInterpreter(
  name: string,
  fn: (assertValid: AssertValid, assertInvalid: AssertInvalid) => void,
) {
  it("Interpreted: " + name, () =>
    fn(assertInterpretValid, assertInterpretInvalid),
  );
}
