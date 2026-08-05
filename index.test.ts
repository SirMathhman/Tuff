import { test, expect } from "bun:test";
import { evaluate } from ".";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toBe(0);
});

test('evaluate(" ") => 0', () => {
  expect(evaluate(" ")).toBe(0);
});

test('evaluate("1") => 1', () => {
  expect(evaluate("1")).toBe(1);
});