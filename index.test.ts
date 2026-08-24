import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    expect(evaluate("")).toBe(0);
  });

  test('evaluate("return 1;") => 1', () => {
    expect(evaluate("return 1;")).toBe(1);
  });

  test('evaluate("return 2;") => 2', () => {
    expect(evaluate("return 2;")).toBe(2);
  });

  test('evaluate("return 3;") => 3', () => {
    expect(evaluate("return 3;")).toBe(3);
  });
});
