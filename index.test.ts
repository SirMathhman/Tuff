import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    expect(evaluate("")).toBe(0);
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

  test('evaluate("let y = { let x = 2 + 3; } * 4; y") => Error', () => {
    expect(() => evaluate("let y = { let x = 2 + 3; } * 4; y")).toThrow();
  });

  test('evaluate("let y = { let x = 100; x }; x") => Error', () => {
    expect(() => evaluate("let y = { let x = 100; x }; x")).toThrow();
  });

  test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
  });

  test('evaluate("let x = 1; let y = &x; *y") => 1', () => {
    expect(evaluate("let x = 1; let y = &x; *y")).toBe(1);
  });

  test('evaluate("let x = 1; let y = &x; y") => Error', () => {
    expect(() => evaluate("let x = 1; let y = &x; y")).toThrow();
  });
});
