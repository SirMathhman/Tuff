import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  test("empty string evaluates to 0", () => {
    expect(evaluate("")).toBe(0);
  });

  test('evaluates "return 1;" to 1', () => {
    expect(evaluate("return 1;")).toBe(1);
  });

  test('evaluates "let x = 1; return x;" to 1', () => {
    expect(evaluate("let x = 1; return x;")).toBe(1);
  });
});
