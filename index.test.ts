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

