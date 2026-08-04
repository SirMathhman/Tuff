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

test("evaluate program ending in let declaration returns 0", () => {
  expect(evaluate("let x = 14;")).toBe(0);
});

test("evaluate block without expression value throws", () => {
  expect(() => evaluate("let x = { let y = 100; };")).toThrow();
});

test("evaluate mutable variable reassignment", () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test("evaluate reassigning immutable variable throws", () => {
  expect(() => evaluate("let x = 0; x = 1; x")).toThrow();
});

test("evaluate boolean literal true", () => {
  expect(evaluate("let x = true; x")).toBe(1);
});

test("evaluate logical or", () => {
  expect(evaluate("let x = true; let y = false; x || y")).toBe(1);
});

test("evaluate equality", () => {
  expect(evaluate("let x = true; let y = false; x == y")).toBe(0);
});

test("evaluate boolean not equal to number", () => {
  expect(evaluate("true == 1")).toBe(0);
});

test("evaluate logical and", () => {
  expect(evaluate("let x = true; let y = false; x && y")).toBe(0);
});

test("evaluate logical not", () => {
  expect(evaluate("!true")).toBe(0);
});

test("evaluate unary minus", () => {
  expect(evaluate("let x = 1; -x")).toBe(-1);
});

test("evaluate less than", () => {
  expect(evaluate("1 < 2")).toBe(1);
});

test("evaluate less than or equal", () => {
  expect(evaluate("2 <= 2")).toBe(1);
});

test("evaluate greater than", () => {
  expect(evaluate("3 > 2")).toBe(1);
});

test("evaluate greater than or equal", () => {
  expect(evaluate("1 >= 2")).toBe(0);
});

test("evaluate not equal", () => {
  expect(evaluate("1 != 2")).toBe(1);
});

test("evaluate if expression", () => {
  expect(evaluate("let x = if (false) 2 else 3; x")).toBe(3);
});

