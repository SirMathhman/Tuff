// Our first compile test, the VM should shut down instantly

import { compile, run } from "../src/app";

// Test helpers
function assertValid(source: string, expected: number, ...stdIn: number[]) {
  const result = run(source, stdIn);
  if (!result.ok) {
    expect(result.error).toBeUndefined();
  } else {
    expect(result.value).toBe(expected);
  }
}

// For assert invalid, we just have to make sure compilation fails, we don't have to run it in the VM
function assertInvalid(source: string) {
  let result = compile(source);
  if (result.ok) {
		expect(result.value).toBeUndefined();
  }
}

describe("The application", () => {
  it("should execute a simple program that halts immediately", () => {
		assertValid("", 0);
  });
});
