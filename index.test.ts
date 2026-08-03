import { evaluate } from ".";
import { test, expect } from "bun:test";

test("evaluate empty string returns 0", () => {
  expect(evaluate("")).toBe(0);
});

test("evaluate whitespace string returns 0", () => {
  expect(evaluate(" ")).toBe(0);
});

