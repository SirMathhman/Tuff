// Our first compile test, the VM should shut down instantly

import { run } from "../src/app";

// Test helpers
function assertValid(source: string, expected: number, ...stdIn: number[]) {
  const result = run(source, stdIn);
  if (!result.ok) {
    expect(result.error).toBeUndefined();
  } else {
    expect(result.value).toBe(expected);
  }
}

function assertInvalid(source: string) {
  const result = run(source, []);
  expect(result.ok).toBe(false);
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
});
