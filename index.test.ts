import { test, expect } from "bun:test";
import { interpret } from ".";

test("interpret empty string returns 0", () => {
  expect(interpret("")).toBe(0);
});

test("interpret single digit returns that digit", () => {
  expect(interpret("1")).toBe(1);
});

test("interpret addition expression", () => {
  expect(interpret("1 + 2")).toBe(3);
});

