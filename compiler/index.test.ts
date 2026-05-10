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

test('executeTuff("256U8") throws error for out of range', () => {
  expect(() => executeTuff("256U8")).toThrow("Value exceeds maximum for U8");
});
