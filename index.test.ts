import { expect, test } from "bun:test";
import { interpretTuff } from "./index.ts";

test('interpretTuff("1") => 1', () => {
  expect(interpretTuff("1")).toBe(1);
});

test('interpretTuff("1 + 2") => 3', () => {
  expect(interpretTuff("1 + 2")).toBe(3);
});

test('interpretTuff("2 + 3 - 4") => 1', () => {
  expect(interpretTuff("2 + 3 - 4")).toBe(1);
});

test('interpretTuff("2 * 3 + 4") => 10', () => {
  expect(interpretTuff("2 * 3 + 4")).toBe(10);
});

test('interpretTuff("2 + 3 * 4") => 14', () => {
  expect(interpretTuff("2 + 3 * 4")).toBe(14);
});

test('interpretTuff("2 * 3 * 4") => 24', () => {
  expect(interpretTuff("2 * 3 * 4")).toBe(24);
});

test('interpretTuff("1 + 2 * 3 - 4 * 5") => -13', () => {
  expect(interpretTuff("1 + 2 * 3 - 4 * 5")).toBe(-13);
});

test('interpretTuff("2 *") throws', () => {
  expect(() => interpretTuff("2 *")).toThrow();
});

test('interpretTuff("2 - * 3") throws', () => {
  expect(() => interpretTuff("2 - * 3")).toThrow();
});

test('interpretTuff("2 3") throws', () => {
  expect(() => interpretTuff("2 3")).toThrow();
});
