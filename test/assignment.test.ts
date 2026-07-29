import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("assignment", () => {
  test('interpret("let x = 0; let x = 1; x") => 1', () => {
    expect(interpret("let x = 0; let x = 1; x")).toBe(1);
  });

  test('interpret("let x = 0; x = 1; x") => Error', () => {
    expect(() => interpret("let x = 0; x = 1; x")).toThrow();
  });

  test('interpret("let mut x = 1; x += 2; x") => 3', () => {
    expect(interpret("let mut x = 1; x += 2; x")).toBe(3);
  });

  test('interpret("let x = 100;") => 0', () => {
    expect(interpret("let x = 100;")).toBe(0);
  });

  test('interpret("let x = { let y = 100; };") => Error', () => {
    expect(() => interpret("let x = { let y = 100; };")).toThrow();
  });

  test('interpret("{ let y = 100; }") => 0 (statement context)', () => {
    expect(interpret("{ let y = 100; }")).toBe(0);
  });

  test('interpret("{ { let x = 1; } }") => 0 (nested statement)', () => {
    expect(interpret("{ { let x = 1; } }")).toBe(0);
  });
});
