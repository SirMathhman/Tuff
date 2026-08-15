import { test, expect } from "@jest/globals";
import { interpret } from "./index";

test('interpret("") throws', () => {
  expect(() => interpret("")).toThrow();
});

test('interpret("1") => 1', () => {
  expect(interpret("1")).toBe(1);
});

test('interpret("abc") throws', () => {
  expect(() => interpret("abc")).toThrow();
});

test('interpret("1 + 2") => 3', () => {
  expect(interpret("1 + 2")).toBe(3);
});

test('interpret("1 + 2 + 3") => 6', () => {
  expect(interpret("1 + 2 + 3")).toBe(6);
});

test('interpret("(2 + 3) * 4") => 20', () => {
  expect(interpret("(2 + 3) * 4")).toBe(20);
});

test('interpret("5 - 3") => 2', () => {
  expect(interpret("5 - 3")).toBe(2);
});

test('interpret("8 / 2") => 4', () => {
  expect(interpret("8 / 2")).toBe(4);
});

test('interpret("-1") => -1', () => {
  expect(interpret("-1")).toBe(-1);
});

test('interpret("1 +") throws', () => {
  expect(() => interpret("1 +")).toThrow();
});

test('interpret("1 2") throws', () => {
  expect(() => interpret("1 2")).toThrow();
});

test('interpret("(1 2)") throws', () => {
  expect(() => interpret("(1 2)")).toThrow();
});

test('interpret(")") throws', () => {
  expect(() => interpret(")")).toThrow();
});

test('interpret("{ 2 + 3 } * 4") => 20', () => {
  expect(interpret("{ 2 + 3 } * 4")).toBe(20);
});

test('interpret("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(interpret("{ let x = 2 + 3; x } * 4")).toBe(20);
});

test('interpret("@") throws', () => {
  expect(() => interpret("@")).toThrow();
});

test('interpret("{ let = 1; }") throws', () => {
  expect(() => interpret("{ let = 1; }")).toThrow();
});

test('interpret("{ let x 1; x }") throws', () => {
  expect(() => interpret("{ let x 1; x }")).toThrow();
});

test('interpret("{ let x = 1 x }") throws', () => {
  expect(() => interpret("{ let x = 1 x }")).toThrow();
});

test('interpret("{ let x = 1; x 2 }") throws', () => {
  expect(() => interpret("{ let x = 1; x 2 }")).toThrow();
});

test('interpret("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(interpret("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});
