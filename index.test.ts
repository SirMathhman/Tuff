import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    expect(evaluate("")).toBe(0);
  });

  test('evaluate("return 1;") => 1', () => {
    expect(evaluate("return 1;")).toBe(1);
  });

  test('evaluate("let x = 1; return x;") => 1', () => {
    expect(evaluate("let x = 1; return x;")).toBe(1);
  });
});
