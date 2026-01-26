import { expect, test as it } from "bun:test";
import { interpret, interpretAll } from "../../main/ts/utils/interpret";
import { compile, evalImpl } from "../../main/ts/compiler/compiler";
import { compileAll } from "../../main/ts/compiler/compile-all";

/**
 * Assert that an interpretation is valid and returns the expected value.
 * @param code The code to interpret
 * @param expectedValue The expected result
 */
function assertInterpretValid(code: string, expectedValue: number): void {
  expect(interpret(code)).toBe(expectedValue);
}

/**
 * Assert that an interpretation throws an error.
 * @param code The code to interpret
 */
function assertInterpretInvalid(code: string): void {
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

// Test helper for runtime validation errors (compiles successfully but fails at runtime)
export function assertExecuteInvalidRuntime(source: string): void {
  const compiled = compile(source);
  expect(() => evalImpl(compiled)).toThrow();
}

/**
 * Assert that compileAll is valid and returns the expected value.
 * @param entry The entry point module path
 * @param sourceMap Module source code map
 * @param expectedValue The expected result
 * @param nativeMap Optional native module implementations
 */
export function assertCompileAllValid(
  entry: string[],
  sourceMap: Map<string[], string>,
  expectedValue: number,
  nativeMap?: Map<string[], string>,
): void {
  const bundled = compileAll(entry, sourceMap, nativeMap);
  try {
    const result = evalImpl(bundled);
    expect(result).toBe(expectedValue);
  } catch {
    throw new Error("Failed to execute compiled bundled code: " + bundled);
  }
}

/**
 * Assert that compileAll throws an error at compile time.
 * @param entry The entry point module path
 * @param sourceMap Module source code map
 * @param nativeMap Optional native module implementations
 */
export function assertCompileAllInvalid(
  entry: string[],
  sourceMap: Map<string[], string>,
  nativeMap?: Map<string[], string>,
): void {
  expect(() => compileAll(entry, sourceMap, nativeMap)).toThrow();
}

type AssertValid = (source: string, expected: number) => void;
type AssertInvalid = (source: string) => void;

type AssertAllValid = (
  entry: string[],
  sourceMap: Map<string[], string>,
  expected: number,
  nativeMap?: Map<string[], string>,
) => void;
type AssertAllInvalid = (
  entry: string[],
  sourceMap: Map<string[], string>,
  nativeMap?: Map<string[], string>,
) => void;

function itInterpreted(
  name: string,
  fn: (assertValid: AssertValid, assertInvalid: AssertInvalid) => void,
): void {
  it("Interpreted: " + name, () =>
    fn(assertInterpretValid, assertInterpretInvalid),
  );
}

export function itBoth(
  name: string,
  fn: (assertValid: AssertValid, assertInvalid: AssertInvalid) => void,
) {
  itInterpreted(name, fn);
  it("Compiled: " + name, () => fn(assertExecuteValid, assertCompileInvalid));
}

/**
 * Test helper for multi-module programs (use statements, extern, etc.)
 * Tests both interpreted and compiled execution paths.
 */
export function itAllBoth(
  name: string,
  fn: (assertValid: AssertAllValid, assertInvalid: AssertAllInvalid) => void,
) {
  it("Interpreted: " + name, () =>
    fn(assertInterpretAllValid, assertInterpretAllInvalid),
  );
  it("Compiled: " + name, () =>
    fn(assertCompileAllValid, assertCompileAllInvalid),
  );
}

/**
 * Test helper for interpreter-only features. Use sparingly; prefer itBoth.
 * This helper is only for features that genuinely don't have compiler support yet.
 */
export function itInterpreter(
  name: string,
  fn: (assertValid: AssertValid, assertInvalid: AssertInvalid) => void,
) {
  itInterpreted(name, fn);
}
