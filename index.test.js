import { test, expect } from "bun:test";
import { evaluateTuff } from "./index.js";

test('evaluateTuff("") returns 0', () => {
  expect(evaluateTuff("")).toBe(0);
});

test('evaluateTuff("return 1;") returns 1', () => {
  expect(evaluateTuff("return 1;")).toBe(1);
});
