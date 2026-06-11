import { executeTuff } from ".";
import { test, expect } from "bun:test";

test("executeTuff(empty string) returns 0", () => {
  expect(executeTuff("")).toBe(0);
});

test("executeTuff(whitespace) returns 0", () => {
  expect(executeTuff("   ")).toBe(0);
  expect(executeTuff("\t\n")).toBe(0);
});

test("executeTuff(invalid source) throws error", () => {
  expect(() => executeTuff("invalid")).toThrow();
});
