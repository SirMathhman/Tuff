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

test("evaluate addition and multiplication expression", () => {
  expect(evaluate("2 + 3 * 4")).toBe(14);
});

test("evaluate parenthesized expression", () => {
  expect(evaluate("(2 + 3) * 4")).toBe(20);
});

test("evaluate brace-grouped expression", () => {
  expect(evaluate("{ 2 + 3 } * 4")).toBe(20);
});

test("evaluate block with variable declaration", () => {
  expect(evaluate("{ let x = 2 + 3; x } * 4")).toBe(20);
});

test("evaluate top-level variable declaration", () => {
  expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});

test("evaluate undefined identifier throws", () => {
  expect(() => evaluate("undefinedIdentifier")).toThrow();
});

test("evaluate declaration-only statement returns 0", () => {
  expect(evaluate("let x = 100;")).toBe(0);
});

test("evaluate redeclared variable uses latest value", () => {
  expect(evaluate("let x = 0; let x = 1; x")).toBe(1);
});

test("evaluate block with only declaration throws", () => {
  expect(() => evaluate("let x = { let y = 0; };")).toThrow();
});

test("evaluate mutable variable assignment", () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test("evaluate assigning to immutable variable throws", () => {
  expect(() => evaluate("let x = 0; x = 1; x")).toThrow();
});

test("evaluate assigning to undefined variable throws", () => {
  expect(() => evaluate("undefinedIdentifier = 100;")).toThrow();
});

test("evaluate block mutating outer variable", () => {
  expect(evaluate("let mut x = 0; { x = 1; } x")).toBe(1);
});

test("evaluate block-scoped variable not visible outside throws", () => {
  expect(() => evaluate("{ let x = 0; } x")).toThrow();
});

test("evaluate boolean true literal", () => {
  expect(evaluate("let x = true; x")).toBe(1);
});

test("evaluate logical or expression", () => {
  expect(evaluate("true || false")).toBe(1);
});

test("evaluate equality expression", () => {
  expect(evaluate("1 == 2")).toBe(0);
});

test("evaluate equality with boolean is strict", () => {
  expect(evaluate("1 == true")).toBe(0);
});

test("evaluate division by zero throws", () => {
  expect(() => evaluate("1 / 0")).toThrow();
});

test("evaluate less than expression", () => {
  expect(evaluate("let x = 0; let y = 1; x < y")).toBe(1);
});

test("evaluate greater than expression", () => {
  expect(evaluate("2 > 1")).toBe(1);
});

test("evaluate less than or equal expression", () => {
  expect(evaluate("1 <= 1")).toBe(1);
});

test("evaluate greater than or equal expression", () => {
  expect(evaluate("2 >= 3")).toBe(0);
});

test("evaluate not equal expression", () => {
  expect(evaluate("1 != 2")).toBe(1);
});

test("evaluate invalid character throws", () => {
  expect(() => evaluate("#")).toThrow();
});

test("evaluate if expression", () => {
  expect(evaluate("let x = if (true) 2 else 3; x")).toBe(2);
});

test("evaluate chained if expression", () => {
  expect(evaluate("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(4);
});

test("evaluate if without else throws", () => {
  expect(() => evaluate("let x = if (false) 2; x")).toThrow();
});

test("evaluate if with empty block branch throws", () => {
  expect(() => evaluate("let x = if (false) {} else { 2 }; x")).toThrow();
});

test("evaluate if with block statements mutating outer variable", () => {
  expect(evaluate("let mut x = 0; if (true) { x = 1; } else { x = 2; } x")).toBe(1);
});

test("evaluate chained if statement", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 1; } else if (false) { x = 2; } else { x = 3; } x")).toBe(3);
});

test("evaluate if statement without else", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 1; } x")).toBe(0);
});

test("evaluate if statement with expression branch", () => {
  expect(evaluate("let mut x = 0; if (true) x = 1; x")).toBe(1);
});

test("evaluate compound assignment", () => {
  expect(evaluate("let mut x = 1; x += 2; x")).toBe(3);
});

test("evaluate while loop", () => {
  expect(evaluate("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

