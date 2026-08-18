import { describe, expect, test } from "bun:test";
import { evaluate, EvaluateErrorKind } from "../src/index.ts";

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    const result = evaluate("");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test('evaluate("1") => 1', () => {
    const result = evaluate("1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
  });

  test('evaluate("1 + 2") => 3', () => {
    const result = evaluate("1 + 2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(3);
    }
  });

  test('evaluate("abc") => Err(UnsupportedInput)', () => {
    const result = evaluate("abc");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(EvaluateErrorKind.UnsupportedInput);
      expect(result.error.input).toBe("abc");
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });
});
