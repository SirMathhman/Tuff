// Our first compile test, the VM should shut down instantly

import { compile, executeWithArray } from "../src/app";

// Test helpers
function assertValid(source: string, expected: number, ...stdIn: number[]) {
	const compileResult = compile(source);
  if (compileResult.ok) {
		const execResult = executeWithArray(compileResult.value, stdIn);
    expect(execResult).toBe(expected);
  } else {
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

  it("should reject negative values with type suffix", () => {
    assertInvalid("-100U8");
  });

  it("should accept negative values with signed type suffix", () => {
    assertValid("-100I8", -100);
  });
});
