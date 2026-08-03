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