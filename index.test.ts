import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

test('interpretTuff("5") => 5', () => {
  expect(interpretTuff("5")).toBe(5);
});

test('interpretTuff("1 + 2") => 3', () => {
  expect(interpretTuff("1 + 2")).toBe(3);
});

test('interpretTuff("1 + 2 + 3") => 6', () => {
  expect(interpretTuff("1 + 2 + 3")).toBe(6);
});

test('interpretTuff("2 + 3 - 4") => 1', () => {
  expect(interpretTuff("2 + 3 - 4")).toBe(1);
});
