import { test, expect } from "bun:test";
import { interpret } from "./index.ts";

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
