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
    ["127I8", 127],
    ["-128I8", -128],
    ["32767I16", 32767],
    ["-32768I16", -32768],
    ["4294967295U32", 4294967295],
    ["18446744073709551615U64", Number(18446744073709551615n)],
    ["1U8 + 2U8", 3],
    ["1 + 2U8", 3],
    ["1 + 2 + 3", 6],
    ["1 + 2 + 3U8", 6],
  ])('should interpret "%s" as %i', expectSuccess);

  it.each([
    ["-100U8", "Unsigned integer cannot be negative"],
    ["256U8", "Value 256 is out of range for U8"],
    ["128I8", "Value 128 is out of range for I8"],
    ["-129I8", "Value -129 is out of range for I8"],
    ["32768I16", "Value 32768 is out of range for I16"],
    ["65536U16", "Value 65536 is out of range for U16"],
    [
      "9223372036854775808I64",
      "Value 9223372036854775808 is out of range for I64",
    ],
    ["1U8 + 216", "Operand must have a suffix"],
    ["1U8 + 255", "Operand must have a suffix"],
    ["1U8 + 255U8", "Value 256 is out of range for U8"],
  ])('should return error for "%s"', expectError);
});
