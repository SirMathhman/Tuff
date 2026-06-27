import { test, expect } from "bun:test";
import { executeTuff } from ".";

test('executeTuff("") returns 0', () => {
  expect(executeTuff("")).toBe(0);
});

test('executeTuff(" ") returns 0', () => {
  expect(executeTuff(" ")).toBe(0);
});

test('executeTuff("1") returns 1', () => {
  expect(executeTuff("1")).toBe(1);
});

test('executeTuff("1 + 2") returns 3', () => {
  expect(executeTuff("1 + 2")).toBe(3);
});

test('executeTuff("1 + { 2 }") returns 3', () => {
  expect(executeTuff("1 + { 2 }")).toBe(3);
});

test('executeTuff("1 + { 2 )") throws Error', () => {
  expect(() => executeTuff("1 + { 2 )")).toThrow();
});

test('executeTuff("1 + { let x = 2; x }") returns 3', () => {
  expect(executeTuff("1 + { let x = 2; x }")).toBe(3);
});

test('executeTuff("1 + 2 + 3") returns 6', () => {
  expect(executeTuff("1 + 2 + 3")).toBe(6);
});

test('executeTuff("2 + 3 - 4") returns 1', () => {
  expect(executeTuff("2 + 3 - 4")).toBe(1);
});

test('executeTuff("2 * 3 - 4") returns 2', () => {
  expect(executeTuff("2 * 3 - 4")).toBe(2);
});

test('executeTuff("2 * (3 - 4)") returns -2', () => {
  expect(executeTuff("2 * (3 - 4)")).toBe(-2);
});

test('executeTuff("let x = 2 * (3 - 4); x") returns -2', () => {
  expect(executeTuff("let x = 2 * (3 - 4); x")).toBe(-2);
});

test('executeTuff("let x = 0; let x = 1; x") returns 1', () => {
  expect(executeTuff("let x = 0; let x = 1; x")).toBe(1);
});

test('executeTuff("let mut x = 0; x = 1; x") returns 1', () => {
  expect(executeTuff("let mut x = 0; x = 1; x")).toBe(1);
});

test('executeTuff("let x = 0; x = 1; x") throws Error', () => {
  expect(() => executeTuff("let x = 0; x = 1; x")).toThrow();
});

test('executeTuff("let mut x = 0; { x = 1; } x") returns 1', () => {
  expect(executeTuff("let mut x = 0; { x = 1; } x")).toBe(1);
});

test('executeTuff("let x = 0; { let x = 1; } x") returns 0', () => {
  expect(executeTuff("let x = 0; { let x = 1; } x")).toBe(0);
});
