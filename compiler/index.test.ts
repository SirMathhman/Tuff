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
