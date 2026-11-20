import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

test('interpretTuff("5") => 5', () => {
  expect(interpretTuff("5")).toBe(5);
});

test('interpretTuff("1 + 2") => 3', () => {
  expect(interpretTuff("1 + 2")).toBe(3);
});
