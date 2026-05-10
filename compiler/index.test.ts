import { executeTuff } from "./index";
import { test, expect } from "bun:test";

test("executeTuff with empty string returns 0", () => {
  expect(executeTuff("")).toBe(0);
});

test('executeTuff("100U8") returns 100', () => {
  expect(executeTuff("100U8")).toBe(100);
});

test('executeTuff("100U16") returns 100', () => {
  expect(executeTuff("100U16")).toBe(100);
});

