import { test, expect } from "bun:test";
import { evaluate } from ".";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toBe(0);
});

test('evaluate(" ") => 0', () => {
  expect(evaluate(" ")).toBe(0);
});

test('evaluate("1") => 1', () => {
  expect(evaluate("1")).toBe(1);
});

test('evaluate("1 + 2") => 3', () => {
  expect(evaluate("1 + 2")).toBe(3);
});

test('evaluate("1 + 2 + 3") => 6', () => {
  expect(evaluate("1 + 2 + 3")).toBe(6);
});

test('evaluate("2 + 3 - 1") => 4', () => {
  expect(evaluate("2 + 3 - 1")).toBe(4);
});

test('evaluate("2 * 3 + 4") => 10', () => {
  expect(evaluate("2 * 3 + 4")).toBe(10);
});

test('evaluate("2 + 3 * 4") => 14', () => {
  expect(evaluate("2 + 3 * 4")).toBe(14);
});

test('evaluate("(2 + 3) * 4") => 20', () => {
  expect(evaluate("(2 + 3) * 4")).toBe(20);
});

test('evaluate("{ 2 + 3 } * 4") => 20', () => {
  expect(evaluate("{ 2 + 3 } * 4")).toBe(20);
});

test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(evaluate("{ let x = 2 + 3; x } * 4")).toBe(20);
});

test('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});

test('evaluate("let x = 0; let x = 1; x") => 1', () => {
  expect(evaluate("let x = 0; let x = 1; x")).toBe(1);
});

test('evaluate("let x = { let y = 100; }; x") => Error', () => {
  expect(() => evaluate("let x = { let y = 100; }; x")).toThrow();
});

test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test('evaluate("let x = true; x") => 1', () => {
  expect(evaluate("let x = true; x")).toBe(1);
});

test('evaluate("let x = false; x") => 0', () => {
  expect(evaluate("let x = false; x")).toBe(0);
});

test('evaluate("let x = 2; let y = 2; x == y") => 1', () => {
  expect(evaluate("let x = 2; let y = 2; x == y")).toBe(1);
});

test('evaluate("true == 1") => 0', () => {
  expect(evaluate("true == 1")).toBe(0);
});

test('evaluate("let x = true; let y = false; x || y") => 1', () => {
  expect(evaluate("let x = true; let y = false; x || y")).toBe(1);
});

test('evaluate("let x = true; let y = false; x && y") => 0', () => {
  expect(evaluate("let x = true; let y = false; x && y")).toBe(0);
});

test('evaluate("1 < 2") => 1', () => {
  expect(evaluate("1 < 2")).toBe(1);
});

test('evaluate("2 < 1") => 0', () => {
  expect(evaluate("2 < 1")).toBe(0);
});

test('evaluate("1 <= 1") => 1', () => {
  expect(evaluate("1 <= 1")).toBe(1);
});

test('evaluate("2 <= 1") => 0', () => {
  expect(evaluate("2 <= 1")).toBe(0);
});

test('evaluate("2 > 1") => 1', () => {
  expect(evaluate("2 > 1")).toBe(1);
});

test('evaluate("1 > 2") => 0', () => {
  expect(evaluate("1 > 2")).toBe(0);
});

test('evaluate("1 >= 1") => 1', () => {
  expect(evaluate("1 >= 1")).toBe(1);
});

test('evaluate("1 >= 2") => 0', () => {
  expect(evaluate("1 >= 2")).toBe(0);
});

test('evaluate("1 != 2") => 1', () => {
  expect(evaluate("1 != 2")).toBe(1);
});

test('evaluate("1 != 1") => 0', () => {
  expect(evaluate("1 != 1")).toBe(0);
});

test('evaluate("let x = true; !x") => 0', () => {
  expect(evaluate("let x = true; !x")).toBe(0);
});

test('evaluate("let x = 100; -x") => -100', () => {
  expect(evaluate("let x = 100; -x")).toBe(-100);
});

test('evaluate("let x = if (false) 2 else 3; x") => 3', () => {
  expect(evaluate("let x = if (false) 2 else 3; x")).toBe(3);
});