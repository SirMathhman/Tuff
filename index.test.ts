import { test, expect } from "bun:test";
import { interpret } from ".";

test("interpret empty string returns 0", () => {
  expect(interpret("")).toBe(0);
});

test("interpret single digit returns that digit", () => {
  expect(interpret("5")).toBe(5);
});

test("interpret multi-digit number returns that number", () => {
  expect(interpret("42")).toBe(42);
});

test("interpret addition of two numbers", () => {
  expect(interpret("1+2")).toBe(3);
});