import { test, expect } from "bun:test";
import { interpret } from ".";

test("interpret empty string returns 0", () => {
  expect(interpret("")).toBe(0);
});

test("interpret single digit returns that digit", () => {
  expect(interpret("1")).toBe(1);
});

test("interpret addition expression", () => {
  expect(interpret("1 + 2")).toBe(3);
});

test("interpret subtraction expression", () => {
  expect(interpret("1 - 2")).toBe(-1);
});

test("interpret chained addition expression", () => {
  expect(interpret("1 + 2 + 3")).toBe(6);
});

test("interpret multiplication takes precedence over addition", () => {
  expect(interpret("1 + 2 * 3")).toBe(7);
});

test("interpret parentheses override precedence", () => {
  expect(interpret("(1 + 2) * 3")).toBe(9);
});

test("interpret division expression", () => {
  expect(interpret("10 / 2")).toBe(5);
});

test("interpret curly braces group like parentheses", () => {
  expect(interpret("{ 2 + 3 } * 4")).toBe(20);
});

test("interpret let declaration inside block", () => {
  expect(interpret("{ let x = 2 + 3; x } * 4")).toBe(20);
});

test("interpret unknown character throws", () => {
  expect(() => interpret("#")).toThrow();
});

test("interpret incomplete expression throws", () => {
  expect(() => interpret("1 +")).toThrow();
});

test("interpret top-level let declaration", () => {
  expect(interpret("let x = 5; x")).toBe(5);
});

test("interpret multiple top-level let declarations", () => {
  expect(interpret("let x = 2; let y = 3; x + y")).toBe(5);
});

test("interpret inner block shadows outer variable", () => {
  expect(interpret("let x = 2; { let x = 3; x } + x")).toBe(5);
});

