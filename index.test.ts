import { test, expect } from "bun:test";
import { evaluate } from ".";

test("evaluate empty string returns 0", () => {
  expect(evaluate("")).toBe(0);
});

test("evaluate whitespace string returns 0", () => {
  expect(evaluate(" ")).toBe(0);
});

test("evaluate single digit returns its value", () => {
  expect(evaluate("1")).toBe(1);
});

test("evaluate addition", () => {
  expect(evaluate("1 + 2")).toBe(3);
});

test("evaluate chained addition", () => {
  expect(evaluate("1 + 2 + 3")).toBe(6);
});

test("evaluate multiplication before addition", () => {
  expect(evaluate("2 * 3 + 4")).toBe(10);
});

test("evaluate parentheses override precedence", () => {
  expect(evaluate("2 * (3 + 4)")).toBe(14);
});

test("evaluate curly braces override precedence", () => {
  expect(evaluate("2 * { 3 + 4 }")).toBe(14);
});

test("evaluate block with variable declaration", () => {
  expect(evaluate("2 * { let x = 3 + 4; x }")).toBe(14);
});

test("evaluate top-level variable declaration", () => {
  expect(evaluate("let y = 2 * { let x = 3 + 4; x }; y")).toBe(14);
});

