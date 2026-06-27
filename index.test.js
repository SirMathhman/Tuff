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
