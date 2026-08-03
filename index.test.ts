import { evaluate } from ".";
import { test, expect } from "bun:test";

test("evaluate empty string returns 0", () => {
  expect(evaluate("")).toBe(0);
});

test("evaluate whitespace string returns 0", () => {
  expect(evaluate(" ")).toBe(0);
});

test("evaluate single digit returns the digit", () => {
  expect(evaluate("1")).toBe(1);
});

test("evaluate addition expression", () => {
  expect(evaluate("1 + 2")).toBe(3);
});

test("evaluate multiple addition expression", () => {
  expect(evaluate("1 + 2 + 3")).toBe(6);
});

test("evaluate addition and subtraction expression", () => {
  expect(evaluate("2 + 3 - 4")).toBe(1);
});

test("evaluate multiplication and subtraction expression", () => {
  expect(evaluate("2 * 3 - 4")).toBe(2);
});

