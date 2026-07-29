import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("comparison operators", () => {
  test('interpret("let x = 0; let y = 1; x < y") => 1', () => {
    expect(interpret("let x = 0; let y = 1; x < y")).toBe(1);
  });

  test('interpret("let x = 0; let y = 1; x > y") => 0', () => {
    expect(interpret("let x = 0; let y = 1; x > y")).toBe(0);
  });

  test('interpret("let x = 0; let y = 1; x == y") => 0', () => {
    expect(interpret("let x = 0; let y = 1; x == y")).toBe(0);
  });

  test('interpret("let x = 0; let y = 1; x != y") => 1', () => {
    expect(interpret("let x = 0; let y = 1; x != y")).toBe(1);
  });

  test('interpret("let x = 0; let y = 1; x <= y") => 1', () => {
    expect(interpret("let x = 0; let y = 1; x <= y")).toBe(1);
  });

  test('interpret("let x = 0; let y = 1; x >= y") => 0', () => {
    expect(interpret("let x = 0; let y = 1; x >= y")).toBe(0);
  });
});
