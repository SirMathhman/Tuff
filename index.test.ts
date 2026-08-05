import { test, expect } from "bun:test";
import { evaluate } from ".";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toBe(0);
});

test(`evaluate(" ") => 0`, () => {
  expect(evaluate(" ")).toBe(0);
});

