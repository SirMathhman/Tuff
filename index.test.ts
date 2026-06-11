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
test('executeTuff("let y = { let x = 1 + 2; x }; y") returns 3', () => {
  expect(executeTuff("let y = { let x = 1 + 2; x }; y")).toBe(3);
});
test('executeTuff("let mut x = 0; x = 3; x") returns 3', () => {
  expect(executeTuff("let mut x = 0; x = 3; x")).toBe(3);
});
test('executeTuff("let array = [1, 2, 3]; array[0]") returns 1', () => {
  expect(executeTuff("let array = [1, 2, 3]; array[0]")).toBe(1);
});
test('executeTuff("let mut array = [0]; array[0] = 100; array[0]") returns 100', () => {
  expect(executeTuff("let mut array = [0]; array[0] = 100; array[0]")).toBe(
    100,
  );
});
test('executeTuff("let x = 0; let x = 100; x") returns 100', () => {
  expect(executeTuff("let x = 0; let x = 100; x")).toBe(100);
});
test('executeTuff("let mut x = 0; { x = 100; } x") returns 100', () => {
  expect(executeTuff("let mut x = 0; { x = 100; } x")).toBe(100);
});
test('executeTuff("let mut x = 5; { let x = 100; } x") returns 5', () => {
  expect(executeTuff("let mut x = 5; { let x = 100; } x")).toBe(5);
});
test('executeTuff("let x = true; x") returns 1', () => {
  expect(executeTuff("let x = true; x")).toBe(1);
});
test("executeTuff(invalid source) throws error", () => {
  expect(() => executeTuff("invalid")).toThrow();
});
