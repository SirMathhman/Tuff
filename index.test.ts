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
test('evaluate("2 + 3 - 4") => 1', () => {
  expect(evaluate("2 + 3 - 4")).toBe(1);
});
test('evaluate("2 * 3 - 4") => 2', () => {
  expect(evaluate("2 * 3 - 4")).toBe(2);
});
test('evaluate("2 + 3 * 4") => 14', () => {
  expect(evaluate("2 + 3 * 4")).toBe(14);
});
test('evaluate("(2 + 3) * 4") => 20', () => {
  expect(evaluate("(2 + 3) * 4")).toBe(20);
});
test('evaluate("(2 + 3) / 4") => 1', () => {
  expect(evaluate("(2 + 3) / 4")).toBe(1);
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
test('evaluate("let x = { let x = 1; 0 }; x") => 0', () => {
  expect(evaluate("let x = { let x = 1; 0 }; x")).toBe(0);
});
test('evaluate("undefinedIdentifier") => Error', () => {
  expect(() => evaluate("undefinedIdentifier")).toThrow();
});
test('evaluate("let x = y; x") => Error', () => {
  expect(() => evaluate("let x = y; x")).toThrow();
});

test('evaluate("let x = 100;") => 0', () => {
  expect(evaluate("let x = 100;")).toBe(0);
});

test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test('evaluate("let mut x = 0; { x = 1; } x") => 1', () => {
  expect(evaluate("let mut x = 0; { x = 1; } x")).toBe(1);
});

test('evaluate("{ let x = 1; } x") => Error', () => {
  expect(() => evaluate("{ let x = 1; } x")).toThrow();
});

test('evaluate("let x = true; x") => 1', () => {
  expect(evaluate("let x = true; x")).toBe(1);
});

test('evaluate("let x = true; let y = false; x || y") => 1', () => {
  expect(evaluate("let x = true; let y = false; x || y")).toBe(1);
});

test('evaluate("let x = true; let y = false; x && y") => 0', () => {
  expect(evaluate("let x = true; let y = false; x && y")).toBe(0);
});

test('evaluate("let x = 0; let y = 1; x < y") => 1', () => {
  expect(evaluate("let x = 0; let y = 1; x < y")).toBe(1);
});

test('evaluate("let x = 0; let y = 1; x > y") => 0', () => {
  expect(evaluate("let x = 0; let y = 1; x > y")).toBe(0);
});

test('evaluate("let x = 0; let y = 1; x <= y") => 1', () => {
  expect(evaluate("let x = 0; let y = 1; x <= y")).toBe(1);
});

test('evaluate("let x = 0; let y = 1; x >= y") => 0', () => {
  expect(evaluate("let x = 0; let y = 1; x >= y")).toBe(0);
});

test('evaluate("let x = if (true) 2 else 3; x") => 2', () => {
  expect(evaluate("let x = if (true) 2 else 3; x")).toBe(2);
});

test('evaluate("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
  expect(evaluate("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(4);
});

test('evaluate("let x = { let y = 100; }; x") => Error', () => {
  expect(() => evaluate("let x = { let y = 100; }; x")).toThrow();
});

test('evaluate("let x = { let mut y = 100; y = 0; }; x") => Error', () => {
  expect(() => evaluate("let x = { let mut y = 100; y = 0; }; x")).toThrow();
});

test('evaluate("let mut y = 0; let x = { y = 100; y = 0; }; x") => Error', () => {
  expect(() =>
    evaluate("let mut y = 0; let x = { y = 100; y = 0; }; x"),
  ).toThrow();
});

test('evaluate("let mut x = 0; if (true) { x = 1; } else { x = 2; } x") => 1', () => {
  expect(
    evaluate("let mut x = 0; if (true) { x = 1; } else { x = 2; } x"),
  ).toBe(1);
});
