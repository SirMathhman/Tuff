import { describe, expect, test } from "bun:test";
import { evaluate, EvalErrorCode } from "./index.ts";

function valueOf(input: string): number {
  const result = evaluate(input);
  expect(result.ok).toBe(true);
  if (!result.ok) return 0;
  return result.value;
}

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    expect(valueOf("")).toBe(0);
  });

  test('evaluate("1") => 1', () => {
    expect(valueOf("1")).toBe(1);
  });

  test('evaluate("1 + 2") => 3', () => {
    expect(valueOf("1 + 2")).toBe(3);
  });

  test('evaluate("1 + 2 + 3") => 6', () => {
    expect(valueOf("1 + 2 + 3")).toBe(6);
  });

  test('evaluate("2 + 3 - 4") => 1', () => {
    expect(valueOf("2 + 3 - 4")).toBe(1);
  });

  test('evaluate("2 * 3 + 4") => 10', () => {
    expect(valueOf("2 * 3 + 4")).toBe(10);
  });

  test('evaluate("2 + (3 * 4)") => 14', () => {
    expect(valueOf("2 + (3 * 4)")).toBe(14);
  });

  test('evaluate("(2 + 3) * 4") => 20', () => {
    expect(valueOf("(2 + 3) * 4")).toBe(20);
  });

  test('evaluate("{ 2 + 3 } * 4") => 20', () => {
    expect(valueOf("{ 2 + 3 } * 4")).toBe(20);
  });

  test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
    expect(valueOf("{ let x = 2 + 3; x } * 4")).toBe(20);
  });

  test('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
    expect(valueOf("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
  });

  test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(valueOf("let mut x = 0; x = 1; x")).toBe(1);
  });

  test('evaluate("let x = 1; let y = &x; *y") => 1', () => {
    expect(valueOf("let x = 1; let y = &x; *y")).toBe(1);
  });

  test('evaluate("something invalid") => Err', () => {
    const result = evaluate("something invalid");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(EvalErrorCode.UnknownVariable);
    }
  });
});
