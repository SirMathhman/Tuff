import { interpret } from "../src/index";

type Result<T, E> = { success: true; data: T } | { success: false; error: E };

function expectValid(input: string, expected: number): void {
  const result = interpret(input);
  if (!result.success) {
    throw new Error(`Expected valid result but got error: ${result.error}`);
  }
  expect(result.data).toBe(expected);
}

function expectInvalid(input: string): void {
  const result = interpret(input);
  if (result.success) {
    throw new Error(`Expected error but got valid result: ${result.data}`);
  }
}

describe("interpret", () => {
  it("should interpret a simple number", () => {
    expectValid("100", 100);
  });

  it("should interpret number with U8 suffix", () => {
    expectValid("100U8", 100);
  });

  it("should return error for negative number with U8 suffix", () => {
    expectInvalid("-100U8");
  });
});
