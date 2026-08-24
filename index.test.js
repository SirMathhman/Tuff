import { test, expect } from "bun:test";
import { evaluateTuff } from "./index.js";

test('evaluateTuff("") returns 0', () => {
  expect(evaluateTuff("")).toBe(0);
});
