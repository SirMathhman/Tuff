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

test("evaluate multiplication and subtraction", () => {
  expect(evaluate("2 * 3 - 4")).toBe(2);
});

test("evaluate addition and multiplication with precedence", () => {
  expect(evaluate("2 + 3 * 4")).toBe(14);
});

test("evaluate parentheses override precedence", () => {
  expect(evaluate("(2 + 3) * 4")).toBe(20);
});

test("evaluate curly braces override precedence", () => {
  expect(evaluate("{ 2 + 3 } * 4")).toBe(20);
});

test("evaluate block with let declaration and variable reference", () => {
  expect(evaluate("{ let x = 2 + 3; x } * 4")).toBe(20);
});

test("evaluate invalid character throws error", () => {
  expect(() => evaluate("#")).toThrow();
});

test("evaluate top-level let with block initializer and reference", () => {
  expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});

test("evaluate variable scoped inside block is not visible outside", () => {
  expect(() => evaluate("let x = { let y = 0; }; y")).toThrow();
});

test("evaluate mutable variable with assignment", () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test("evaluate assignment inside nested block mutates outer variable", () => {
  expect(evaluate("let mut x = 0; { x = 1; } x")).toBe(1);
});

test("evaluate boolean true literal", () => {
  expect(evaluate("let x = true; x")).toBe(1);
});

test("evaluate logical or", () => {
  expect(evaluate("true || false")).toBe(1);
});

test("evaluate logical and", () => {
  expect(evaluate("true && false")).toBe(0);
});

test("evaluate equality", () => {
  expect(evaluate("1 == 2")).toBe(0);
});

test("evaluate equality is type-aware", () => {
  expect(evaluate("1 == true")).toBe(0);
});

test("evaluate logical or requires boolean operands", () => {
  expect(() => evaluate("1 || 2")).toThrow();
});

test("evaluate arithmetic requires numeric operands", () => {
  expect(() => evaluate("true + false")).toThrow();
});

test("evaluate less than", () => {
  expect(evaluate("1 < 2")).toBe(1);
});

test("evaluate greater than", () => {
  expect(evaluate("2 > 1")).toBe(1);
});

test("evaluate less than or equal", () => {
  expect(evaluate("2 <= 2")).toBe(1);
});

test("evaluate greater than or equal", () => {
  expect(evaluate("2 >= 3")).toBe(0);
});

test("evaluate not equal", () => {
  expect(evaluate("1 != 2")).toBe(1);
});

test("evaluate if expression with else", () => {
  expect(evaluate("let x = if (true) 2 else 3; x")).toBe(2);
});

test("evaluate chained else if", () => {
  expect(evaluate("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(4);
});

test("evaluate if with block branches mutates outer variable", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } x")).toBe(2);
});

test("evaluate chained else if with block branches", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 1; } else if (false) { x = 2; } else { x = 3; } x")).toBe(3);
});

test("evaluate if without else leaves variable unchanged", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 1; } x")).toBe(0);
});