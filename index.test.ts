import { expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

test('evaluateTuff("1") => 1', () => {
  expect(evaluateTuff("1")).toBe(1);
});

test('evaluateTuff("1 + 2") => 3', () => {
  expect(evaluateTuff("1 + 2")).toBe(3);
});
