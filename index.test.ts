import { describe, expect, test } from "bun:test";
import { interpret } from "./index";

describe("interpret", () => {
  test('interpret("") returns 0', () => {
    expect(interpret("")).toBe(0);
  });

  test('interpret("1") returns 1', () => {
    expect(interpret("1")).toBe(1);
  });

  test('interpret("1 + 2 + 3") returns 6', () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });

  test('interpret("2 + 3 - 4") returns 1', () => {
    expect(interpret("2 + 3 - 4")).toBe(1);
  });

  test('interpret("2 + 3 * 4") returns 14', () => {
    expect(interpret("2 + 3 * 4")).toBe(14);
  });

  test('interpret("(2 + 3) * 4") returns 20', () => {
    expect(interpret("(2 + 3) * 4")).toBe(20);
  });

  test('interpret("{ 2 + 3 } * 4") returns 20', () => {
    expect(interpret("{ 2 + 3 } * 4")).toBe(20);
  });

  test('interpret("{ let x = 2 + 3; x } * 4") returns 20', () => {
    expect(interpret("{ let x = 2 + 3; x } * 4")).toBe(20);
  });

  test('interpret("let y = { let x = 2 + 3; x } * 4; y") returns 20', () => {
    expect(interpret("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
  });

  test('interpret("let x = 1;") returns 0', () => {
    expect(interpret("let x = 1;")).toBe(0);
  });
});
