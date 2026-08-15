import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toBe(0);
});

describe("arithmetic", () => {
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

  test('evaluate("2 * 3 + 4") => 10', () => {
    expect(evaluate("2 * 3 + 4")).toBe(10);
  });

  test('evaluate("2 + 3 * 4") => 14', () => {
    expect(evaluate("2 + 3 * 4")).toBe(14);
  });

  test('evaluate("(2 + 3) * 4") => 20', () => {
    expect(evaluate("(2 + 3) * 4")).toBe(20);
  });
});

describe("blocks", () => {
  test('evaluate("{ 2 + 3 } * 4") => 20', () => {
    expect(evaluate("{ 2 + 3 } * 4")).toBe(20);
  });

  test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
    expect(evaluate("{ let x = 2 + 3; x } * 4")).toBe(20);
  });

  test('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
    expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
  });

  test('evaluate("let mut x = 0; { x = 1; } x") => 1', () => {
    expect(evaluate("let mut x = 0; { x = 1; } x")).toBe(1);
  });

  test('evaluate("let x = { let y = 100; }; x") => Error', () => {
    expect(() => evaluate("let x = { let y = 100; }; x")).toThrow();
  });

  test('evaluate("let mut x = 0; let y = { x = 100; };") => Error', () => {
    expect(() => evaluate("let mut x = 0; let y = { x = 100; };")).toThrow();
  });

  test('evaluate("let mut x = 0; let y = { {} };") => Error', () => {
    expect(() => evaluate("let mut x = 0; let y = { {} };")).toThrow();
  });
});

describe("let and mut", () => {
  test('evaluate("let x = 100;") => 0', () => {
    expect(evaluate("let x = 100;")).toBe(0);
  });

  test('evaluate("let x = 100; 1") => 1', () => {
    expect(evaluate("let x = 100; 1")).toBe(1);
  });

  test('evaluate("let x = 1; let y = 2; x + y") => 3', () => {
    expect(evaluate("let x = 1; let y = 2; x + y")).toBe(3);
  });

  test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
  });

  test('evaluate("let x = 0; x = 1; x") => Error', () => {
    expect(() => evaluate("let x = 0; x = 1; x")).toThrow();
  });

  test('evaluate("let x = true; x") => 1', () => {
    expect(evaluate("let x = true; x")).toBe(1);
  });

  test('evaluate("let x = true; let y = false; x || y") => 1', () => {
    expect(evaluate("let x = true; let y = false; x || y")).toBe(1);
  });

  test('evaluate("let x = 1; let y = 2; x == y") => 0', () => {
    expect(evaluate("let x = 1; let y = 2; x == y")).toBe(0);
  });
});
