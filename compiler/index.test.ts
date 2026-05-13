import { expect, test } from "bun:test";

import { interpretTuff } from "./index";

test("empty string returns 0", () => {
  expect(interpretTuff("")).toBe(0);
});

test('"100U8" returns 100', () => {
  expect(interpretTuff("100U8")).toBe(100);
});

test('"-100U8" throws Error', () => {
  expect(() => interpretTuff("-100U8")).toThrow(Error);
});

test('"256U8" throws Error', () => {
  expect(() => interpretTuff("256U8")).toThrow(Error);
});

test('"-100U16" throws Error', () => {
  expect(() => interpretTuff("-100U16")).toThrow(Error);
});

test('"-100I8" returns -100', () => {
  expect(interpretTuff("-100I8")).toBe(-100);
});

test('"1U8 + 255U8" throws Error', () => {
  expect(() => interpretTuff("1U8 + 255U8")).toThrow(Error);
});

test('"1U8 + 255U16" returns 256', () => {
  expect(interpretTuff("1U8 + 255U16")).toBe(256);
});

test('"2U8 * 3U8 - 4U8" returns 2', () => {
  expect(interpretTuff("2U8 * 3U8 - 4U8")).toBe(2);
});

test('"2U8 + 3U8 * 4U8" returns 14', () => {
  expect(interpretTuff("2U8 + 3U8 * 4U8")).toBe(14);
});
test('"(2U8 + 3U8) * 4U8" returns 20', () => {
  expect(interpretTuff("(2U8 + 3U8) * 4U8")).toBe(20);
});

test('"((1U8 + 2U8))" returns 3 (nested parens)', () => {
  expect(interpretTuff("((1U8 + 2U8))")).toBe(3);
});

test('"(1U8 + 2U8) * (3U8 + 4U8)" returns 21', () => {
  expect(interpretTuff("(1U8 + 2U8) * (3U8 + 4U8)")).toBe(21);
});

test('"5U8 - (2U8 + 1U8)" returns 2', () => {
  expect(interpretTuff("5U8 - (2U8 + 1U8)")).toBe(2);
});

test("nested block with let declarations returns 100", () => {
  expect(interpretTuff("let x : U8 = { let y : U8 = 100U8; y }; x")).toBe(100);
});

test('"let x : U8 = 100U8;" with no trailing expr returns 0', () => {
  expect(interpretTuff("let x : U8 = 100U8;")).toBe(0);
});

test('inferred type: "let x = 100U8; x" returns 100', () => {
  expect(interpretTuff("let x = 100U8; x")).toBe(100);
});

test('"let x = 100U8; let x = 200U8;" throws Error (duplicate name)', () => {
  expect(() => interpretTuff("let x = 100U8; let x = 200U8;")).toThrow(Error);
});

test('"let x : U8 = 100U16;" throws Error (narrowing type not allowed)', () => {
  expect(() => interpretTuff("let x : U8 = 100U16;")).toThrow(Error);
});

test('"let x = 100U16; let y : U8 = x;" throws Error (narrowing via variable)', () => {
  expect(() => interpretTuff("let x = 100U16; let y : U8 = x;")).toThrow(Error);
});

test('mutable variable: "let mut x : U8 = 0U8; x = 100U8; x" returns 100', () => {
  expect(interpretTuff("let mut x : U8 = 0U8; x = 100U8; x")).toBe(100);
});

test('array literal and indexing: "let x = [1, 2, 3]; x[0]" returns 1', () => {
  expect(interpretTuff("let x = [1U8, 2U8, 3U8]; x[0]")).toBe(1);
});

test('array literal and indexing: "let x = [1, 2, 3]; x[1]" returns 2', () => {
  expect(interpretTuff("let x = [1U8, 2U8, 3U8]; x[1]")).toBe(2);
});

test('array literal and indexing: "let x = [1, 2, 3]; x[2]" returns 3', () => {
  expect(interpretTuff("let x = [1U8, 2U8, 3U8]; x[2]")).toBe(3);
});

test('array out of bounds throws Error', () => {
  expect(() => interpretTuff("let x = [1U8, 2U8, 3U8]; x[5]")).toThrow(Error);
});

test('explicit array type: "let x : [U8; 3] = [100U8, 200U8, 50U8]; x[1]" returns 200', () => {
  expect(interpretTuff("let x : [U8; 3] = [100U8, 200U8, 50U8]; x[1]")).toBe(200);
});

test('array length mismatch throws Error', () => {
  expect(() => interpretTuff("let x : [U8; 3] = [1U8, 2U8]")).toThrow(Error);
});

test('mixed element types in array literal throws Error', () => {
  expect(() => interpretTuff("let x = [1U8, 2U16]; x[0]")).toThrow(Error);
});

// Bool type tests
test('"true" returns 1', () => {
  expect(interpretTuff("true")).toBe(1);
});

test('"false" returns 0', () => {
  expect(interpretTuff("false")).toBe(0);
});

test('let temp : Bool = true; temp returns 1', () => {
  expect(interpretTuff("let temp : Bool = true; temp")).toBe(1);
});

test('let b : Bool = false; b returns 0', () => {
  expect(interpretTuff("let b : Bool = false; b")).toBe(0);
});

test('"true + 2U8" returns 3 (Bool promotes to U8)', () => {
  expect(interpretTuff("true + 2U8")).toBe(3);
});

test('bool narrowing: "let x : Bool = 1U8;" throws Error', () => {
  expect(() => interpretTuff("let x : Bool = 1U8;")).toThrow(Error);
});

// Logical OR (||) tests
test('"true || false" returns 1', () => {
  expect(interpretTuff("true || false")).toBe(1);
});

test('"false || true" returns 1', () => {
  expect(interpretTuff("false || true")).toBe(1);
});

test('"false || false" returns 0', () => {
  expect(interpretTuff("false || false")).toBe(0);
});

test('"true || true" returns 1', () => {
  expect(interpretTuff("true || true")).toBe(1);
});

test('let x = true; let y = false; x || y returns 1', () => {
  expect(interpretTuff("let x = true; let y = false; x || y")).toBe(1);
});

// Logical AND (&&) tests
test('"true && false" returns 0', () => {
  expect(interpretTuff("true && false")).toBe(0);
});

test('"false && true" returns 0', () => {
  expect(interpretTuff("false && true")).toBe(0);
});

test('"false && false" returns 0', () => {
  expect(interpretTuff("false && false")).toBe(0);
});

test('"true && true" returns 1', () => {
  expect(interpretTuff("true && true")).toBe(1);
});

test('let x = true; let y = false; x && y returns 0', () => {
  expect(interpretTuff("let x = true; let y = false; x && y")).toBe(0);
});
test('bare integer defaults to I32: "let x = 100; x" returns 100', () => {
  expect(interpretTuff("let x = 100; x")).toBe(100);
});

