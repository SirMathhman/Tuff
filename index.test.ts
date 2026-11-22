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
