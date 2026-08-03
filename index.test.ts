import { test, expect } from "bun:test";
import { evaluate } from ".";

test("evaluate empty string returns 0", () => {
  expect(evaluate("")).toBe(0);
});

test("evaluate single digit returns that digit", () => {
  expect(evaluate("1")).toBe(1);
});

test("evaluate addition of two numbers", () => {
  expect(evaluate("1 + 2")).toBe(3);
});

test("evaluate addition of three numbers", () => {
  expect(evaluate("1 + 2 + 3")).toBe(6);
});

test("evaluate addition and subtraction", () => {
  expect(evaluate("2 + 3 - 4")).toBe(1);
});