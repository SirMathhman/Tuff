import { executeTuff } from "./index";
import { test, expect } from "bun:test";

test("executeTuff with empty string returns 0", () => {
  expect(executeTuff("")).toBe(0);
});

test('executeTuff("100U8") returns 100', () => {
  expect(executeTuff("100U8")).toBe(100);
});

test('executeTuff("100U16") returns 100', () => {
  expect(executeTuff("100U16")).toBe(100);
});

test('executeTuff("-100U8") throws error for negative values', () => {
  expect(() => executeTuff("-100U8")).toThrow("Negative values are not supported");
});

test('executeTuff("256U8") throws error for out of range', () => {
  expect(() => executeTuff("256U8")).toThrow("Value exceeds maximum for U8");
});

test('executeTuff("9007199254740993U64") returns bigint', () => {
  expect(executeTuff("9007199254740993U64")).toBe(9007199254740993n);
});

test('executeTuff("-100I8") returns -100', () => {
  expect(executeTuff("-100I8")).toBe(-100);
});

test('executeTuff("1U8 + 2U8") returns 3', () => {
  expect(executeTuff("1U8 + 2U8")).toBe(3);
});

test('executeTuff("1U8 + 2U8 + 3U8") returns 6', () => {
  expect(executeTuff("1U8 + 2U8 + 3U8")).toBe(6);
});

test('executeTuff("1U8 * 2U8 + 3U8") returns 5', () => {
  expect(executeTuff("1U8 * 2U8 + 3U8")).toBe(5);
});

test('executeTuff("1U8 + 2U8 * 3U8") returns 7', () => {
  expect(executeTuff("1U8 + 2U8 * 3U8")).toBe(7);
});

test('executeTuff("(1U8 + 2U8) * 3U8") returns 9', () => {
  expect(executeTuff("(1U8 + 2U8) * 3U8")).toBe(9);
});

test('executeTuff("{ 1U8 + 2U8 } * 3U8") returns 9', () => {
  expect(executeTuff("{ 1U8 + 2U8 } * 3U8")).toBe(9);
});

test('executeTuff("{ let x : U8 = 1U8 + 2U8; x } * 3U8") returns 9', () => {
  expect(executeTuff("{ let x : U8 = 1U8 + 2U8; x } * 3U8")).toBe(9);
});

test('executeTuff("let y : U8 = { let x : U8 = 1U8 + 2U8; x } * 3U8; y") returns 9', () => {
  expect(executeTuff("let y : U8 = { let x : U8 = 1U8 + 2U8; x } * 3U8; y")).toBe(9);
});

test('executeTuff("let x : U8 = 100U8;") returns 0', () => {
  expect(executeTuff("let x : U8 = 100U8;")).toBe(0);
});

test('executeTuff("let x = 100U8; x") returns 100', () => {
  expect(executeTuff("let x = 100U8; x")).toBe(100);
});

test('executeTuff("let x = 0U8; let x = 10U8; x") returns 10', () => {
  expect(executeTuff("let x = 0U8; let x = 10U8; x")).toBe(10);
});

test('executeTuff("let x : U8 = 0U16; x") throws error for type mismatch', () => {
  expect(() => executeTuff("let x : U8 = 0U16; x")).toThrow();
});

test('executeTuff("let x = 0U16; let y : U8 = x;") throws error for narrowing assignment', () => {
  expect(() => executeTuff("let x = 0U16; let y : U8 = x;")).toThrow();
});

test('executeTuff("let mut x = 0U8; x = 1U8; x") returns 1', () => {
  expect(executeTuff("let mut x = 0U8; x = 1U8; x")).toBe(1);
});

test('executeTuff("let mut x = 0U8; x = 1U16; x") throws error for widening assignment', () => {
  expect(() => executeTuff("let mut x = 0U8; x = 1U16; x")).toThrow();
});

test('executeTuff("x = 1U16; x") throws error for undeclared variable', () => {
  expect(() => executeTuff("x = 1U16; x")).toThrow();
});

test('executeTuff("let x = 100U16; x = 1U16; x") throws error for reassigning immutable variable', () => {
  expect(() => executeTuff("let x = 100U16; x = 1U16; x")).toThrow();
});

test('executeTuff("let x = 0U8; let y = &x;") returns 0', () => {
  expect(executeTuff("let x = 0U8; let y = &x;")).toBe(0);
});

test('executeTuff("let x = 0U8; let y : *U8 = &x;") returns 0', () => {
  expect(executeTuff("let x = 0U8; let y : *U8 = &x;")).toBe(0);
});

test('executeTuff("let x = 0U8; let y : *U8 = &x; let z : U8 = *y;") returns 0', () => {
  expect(executeTuff("let x = 0U8; let y : *U8 = &x; let z : U8 = *y;")).toBe(0);
});

test('executeTuff("let x = 0U8; let y : *U8 = &x; *y") returns 0', () => {
  expect(executeTuff("let x = 0U8; let y : *U8 = &x; *y")).toBe(0);
});

test('executeTuff("let x = 1U8; let y : *U8 = &x; *y") returns 1', () => {
  expect(executeTuff("let x = 1U8; let y : *U8 = &x; *y")).toBe(1);
});

test('executeTuff("&x") throws error for undefined variable', () => {
  expect(() => executeTuff("&x")).toThrow();
});

test('executeTuff("let x = 0U8; let y : *U16 = &x;") throws error for pointer type mismatch', () => {
  expect(() => executeTuff("let x = 0U8; let y : *U16 = &x;")).toThrow();
});

test('executeTuff("let x = 0U8; *x") throws error for dereferencing non-pointer', () => {
  expect(() => executeTuff("let x = 0U8; *x")).toThrow();
});

test('executeTuff("let x : Bool = true; x") returns 1', () => {
  expect(executeTuff("let x : Bool = true; x")).toBe(1);
});

test('executeTuff("let x : Bool = false; x") returns 0', () => {
  expect(executeTuff("let x : Bool = false; x")).toBe(0);
});

test('executeTuff("let x = true; let y = false; x || y") returns 1', () => {
  expect(executeTuff("let x = true; let y = false; x || y")).toBe(1);
});

test('executeTuff("let x = true; let y = false; x && y") returns 0', () => {
  expect(executeTuff("let x = true; let y = false; x && y")).toBe(0);
});
test('executeTuff("let mut x = 0U8; { x = 100U8; } x") returns 100', () => {
  expect(executeTuff("let mut x = 0U8; { x = 100U8; } x")).toBe(100);
});



