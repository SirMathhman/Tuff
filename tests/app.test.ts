// Our first compile test, the VM should shut down instantly

import { compile, executeWithArray } from "../src/app";

// Test helpers
function assertValid(source: string, expected: number, ...stdIn: number[]) {
  const compileResult = compile(source);
  if (compileResult.ok) {
    const execResult = executeWithArray(compileResult.value, stdIn);
    if (execResult !== expected) {
      // Do we have an  equivalent to Assertions.fail()?
      expect(
        "Failed to execute compiled instructions: " +
          JSON.stringify(compileResult.value, null, 2),
      ).toBeUndefined();
    }

    expect(execResult).toBe(expected);
  } else {
    // Do we have an  equivalent to Assertions.fail()?
    expect(compileResult.error).toBeUndefined();
  }
}

function assertInvalid(source: string) {
  const compileResult = compile(source);
  expect(compileResult.ok).toBe(false);
}

describe("The application", () => {
  it("should execute a simple program that halts immediately", () => {
    assertValid("", 0);
  });

  it("should halt with exit code 100", () => {
    assertValid("100", 100);
  });

  it("should halt with exit code 100 from U8 literal", () => {
    assertValid("100U8", 100);
  });

  it("should read a U8 value from stdin and halt with it", () => {
    assertValid("read U8", 100, 100);
  });

  it("should read two U8 values, add them, and halt with result", () => {
    assertValid("read U8 + read U8", 150, 100, 50);
  });

  it("should read a U8 value and add a constant, and halt with result", () => {
    assertValid("read U8 + 50U8", 150, 100);
  });

  it("should add a constant and read a U8 value, and halt with result", () => {
    assertValid("50U8 + read U8", 150, 100);
  });

  it("should read three U8 values, add them, and halt with result", () => {
    assertValid("read U8 + read U8 + read U8", 6, 1, 2, 3);
  });

  it("should read three U8 values, add first two, subtract third, and halt with result", () => {
    assertValid("read U8 + read U8 - read U8", 1, 2, 3, 4);
  });

  it("should read three U8 values, add first, multiply second and third, and halt with result", () => {
    assertValid("read U8 + read U8 * read U8", 10, 4, 2, 3);
  });

  it("should read three U8 values, add first, divide second by third, and halt with result", () => {
    assertValid("read U8 + read U8 / read U8", 7, 4, 6, 2);
  });

  it("should add two U8 values in parentheses, then divide by third, and halt with result", () => {
    assertValid("(read U8 + read U8) / read U8", 2, 10, 2, 6);
  });

  it("should reject negative values with type suffix", () => {
    assertInvalid("-100U8");
  });

  it("should accept negative values with signed type suffix", () => {
    assertValid("-100I8", -100);
  });

  it("should reject values that overflow unsigned 8-bit", () => {
    assertInvalid("256U8");
  });

  it("should support curly braces as grouping mechanism", () => {
    assertValid("(read U8 + { read U8 }) / read U8", 2, 10, 2, 6);
  });
});
