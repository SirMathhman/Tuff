import { describe, it, expect } from "vitest";
import { interpret } from "./index";

describe("interpret", () => {
  function expectSuccess(input: string, expectedValue: number) {
    const result = interpret(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(expectedValue);
    }
  }

  function expectError(input: string, expectedError: string) {
    const result = interpret(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(expectedError);
    }
  }

  it("should return a number", () => {
    const result = interpret("123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value).toBe("number");
    }
  });

  it.each([
    ["100", 100],
    ["100U8", 100],
  ])('should interpret "%s" as %i', expectSuccess);

  it.each([
    ["-100U8", "Unsigned integer cannot be negative"],
    ["256U8", "Value 256 is out of range for U8"],
  ])('should return error for "%s"', expectError);
});
