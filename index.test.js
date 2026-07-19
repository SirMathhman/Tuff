import { test, expect } from "bun:test";
import { evaluate } from ".";

test("evaluate empty string returns 0", () => {
  expect(evaluate("")).toBe(0);
});

test("evaluate single number", () => {
  expect(evaluate("1")).toBe(1);
});

test("evaluate addition expression", () => {
  expect(evaluate("1 + 2")).toBe(3);
});

test("evaluate chained addition", () => {
  expect(evaluate("1 + 2 + 3")).toBe(6);
});

test("evaluate addition and subtraction", () => {
  expect(evaluate("3 + 4 - 5")).toBe(2);
});

test("evaluate multiplication and subtraction", () => {
  expect(evaluate("3 * 4 - 5")).toBe(7);
});

test("evaluate operator precedence", () => {
  expect(evaluate("3 + 4 * 5")).toBe(23);
});

test("evaluate parentheses", () => {
  expect(evaluate("(3 + 4) * 5")).toBe(35);
});

test("evaluate incomplete expression throws error", () => {
  expect(() => evaluate("1 + ")).toThrow();
});

test("evaluate unmatched parenthesis throws error", () => {
  expect(() => evaluate("(1 + 2")).toThrow();
});

test("evaluate curly braces grouping", () => {
  expect(evaluate("{ 3 + 4 } * 5")).toBe(35);
});

test("evaluate curly braces with let declaration", () => {
  expect(evaluate("{ let x = 3 + 4; x } * 5")).toBe(35);
});

test("evaluate top-level let with nested block", () => {
  expect(evaluate("let y = { let x = 3 + 4; x } * 5; y")).toBe(35);
});

test("evaluate let without assignment throws error", () => {
  expect(() => evaluate("let x;")).toThrow();
});

test("evaluate undefined identifier throws error", () => {
  expect(() => evaluate("undefinedIdentifier")).toThrow();
});

test("evaluate mutable variable assignment", () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test("evaluate assignment to immutable variable throws error", () => {
  expect(() => evaluate("let x = 0; x = 1; x")).toThrow();
});

test("evaluate assignment to undefined variable throws error", () => {
  expect(() => evaluate("x = 1; x")).toThrow();
});