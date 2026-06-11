import { executeTuff } from ".";
import { test, expect } from "bun:test";

test("executeTuff(empty string) returns 0", () => {
  expect(executeTuff("")).toBe(0);
});

test("executeTuff(whitespace) returns 0", () => {
  expect(executeTuff("   ")).toBe(0);
  expect(executeTuff("\t\n")).toBe(0);
});

test('executeTuff("100") returns 100', () => {
  expect(executeTuff("100")).toBe(100);
});

test('executeTuff("1 + 2") returns 3', () => {
  expect(executeTuff("1 + 2")).toBe(3);
});

test('executeTuff("{ 1 + 2 }") returns 3', () => {
  expect(executeTuff("{ 1 + 2 }"));
});

test('executeTuff("{ 1 } + 2") returns 3', () => {
  expect(executeTuff("{ 1 } + 2")).toBe(3);
});

test('executeTuff("{ 1 } + { 2 }") returns 3', () => {
  expect(executeTuff("{ 1 } + { 2 }")).toBe(3);
});

test('executeTuff("{{ 1 } + { 2 }}") returns 3', () => {
  expect(executeTuff("{{ 1 } + { 2 }}")).toBe(3);
});

test('executeTuff("{ let x = 1 + 2; x }") returns 3', () => {
  expect(executeTuff("{ let x = 1 + 2; x }")).toBe(3);
});

test("executeTuff(invalid source) throws error", () => {
  expect(() => executeTuff("invalid")).toThrow();
});
