import { test, expect } from "bun:test";
import { interpret } from ".";

test('interpret("") => 0', () => {
  expect(interpret("")).toBe(0);
});

test('interpret(" ") => 0', () => {
  expect(interpret(" ")).toBe(0);
});

test('interpret("1") => 1', () => {
  expect(interpret("1")).toBe(1);
});

test('interpret("1 + 2") => 3', () => {
  expect(interpret("1 + 2")).toBe(3);
});

test('interpret("1 + 2 + 3") => 6', () => {
  expect(interpret("1 + 2 + 3")).toBe(6);
});

test('interpret("2 + 3 - 4") => 1', () => {
  expect(interpret("2 + 3 - 4")).toBe(1);
});

test('interpret("2 * 3 - 4") => 2', () => {
  expect(interpret("2 * 3 - 4")).toBe(2);
});

test('interpret("2 + 3 * 4") => 14', () => {
  expect(interpret("2 + 3 * 4")).toBe(14);
});

test('interpret("(2 + 3) * 4") => 20', () => {
  expect(interpret("(2 + 3) * 4")).toBe(20);
});

