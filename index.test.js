import { test, expect } from "bun:test";
import { executeTuff } from ".";

test('executeTuff("") returns 0', () => {
  expect(executeTuff("")).toBe(0);
});

test('executeTuff(" ") returns 0', () => {
  expect(executeTuff(" ")).toBe(0);
});
