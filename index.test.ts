import { test, expect } from "bun:test";
import { evaluate } from ".";

test("evaluate empty string returns 0", () => {
  expect(evaluate("")).toBe(0);
});

test("evaluate single digit returns that digit", () => {
  expect(evaluate("1")).toBe(1);
});