import { expect, describe, test } from "bun:test";
import { compile, execute } from "../../src/compiler/compiler";

function assertExecuteValid(source: string, expected: number): void {
  const result = execute(source);
  expect(result).toBe(expected);
}

// Test helper for compile-time validation errors
function assertCompileInvalid(source: string): void {
  expect(() => compile(source)).toThrow();
}

describe("compiler - arithmetic", () => {
  test("returns 0 for empty string", () => {
    assertExecuteValid("", 0);
  });

  test("parses a number string and returns the number", () => {
    assertExecuteValid("100", 100);
  });

  test("parses simple addition", () => {
    assertExecuteValid("1 + 2", 3);
  });

  test("parses addition with multiple operands", () => {
    assertExecuteValid("1 + 2 + 3", 6);
  });

  test("parses mixed addition and subtraction", () => {
    assertExecuteValid("2 + 3 - 4", 1);
  });

  test("respects operator precedence: multiplication before subtraction", () => {
    assertExecuteValid("2 * 3 - 4", 2);
  });

  test("respects operator precedence: multiplication before addition", () => {
    assertExecuteValid("2 + 3 * 4", 14);
  });

  test("respects parentheses for grouping", () => {
    assertExecuteValid("(2 + 3) * 4", 20);
  });

  test("supports unary minus on positive number", () => {
    assertExecuteValid("-(5)", -5);
  });

  test("supports unary minus on expression", () => {
    assertExecuteValid("-(2 + 3)", -5);
  });

  test("throws for negative value with unsigned suffix", () => {
    assertCompileInvalid("-100U8");
  });

  test("throws for overflow with unsigned suffix U8", () => {
    assertCompileInvalid("256U8");
  });

  test("throws on overflow when adding two U8 values", () => {
    assertCompileInvalid("1000U8");
  });
});
