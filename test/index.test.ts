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

  test('evaluate("   ") => 0', () => {
    const result = evaluate("   ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test('evaluate("\t\n") => 0', () => {
    const result = evaluate("\t\n");
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

  test('evaluate("1 + 2 + 3") => 6', () => {
    const result = evaluate("1 + 2 + 3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(6);
    }
  });

  test('evaluate("2 + 3 - 4") => 1', () => {
    const result = evaluate("2 + 3 - 4");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
  });

  test('evaluate("2 * 3 + 4") => 10', () => {
    const result = evaluate("2 * 3 + 4");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
    }
  });

  test('evaluate("2 * 3 * 4") => 24', () => {
    const result = evaluate("2 * 3 * 4");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(24);
    }
  });

  test('evaluate("1 + 2 * 3") => 7', () => {
    const result = evaluate("1 + 2 * 3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(7);
    }
  });

  test('evaluate("2 + 3 * 4") => 14', () => {
    const result = evaluate("2 + 3 * 4");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(14);
    }
  });

  test('evaluate("(2 + 3) * 4") => 20', () => {
    const result = evaluate("(2 + 3) * 4");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(20);
    }
  });

  test('evaluate("2 - 3 * 4") => -10', () => {
    const result = evaluate("2 - 3 * 4");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-10);
    }
  });

  test('evaluate("10 - 2 - 3") => 5', () => {
    const result = evaluate("10 - 2 - 3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });

  test('evaluate("-2 * 3") => -6', () => {
    const result = evaluate("-2 * 3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-6);
    }
  });

  test('evaluate("2 * -3") => -6', () => {
    const result = evaluate("2 * -3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-6);
    }
  });

  test('evaluate("abc") => Err(ParseError) at position 0', () => {
    const result = evaluate("abc");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(EvaluateErrorKind.ParseError);
      expect(result.error.input).toBe("abc");
      expect(result.error.position).toBe(0);
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  test('evaluate("1 + 2 x") => Err(ParseError) at position 6', () => {
    const result = evaluate("1 + 2 x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.position).toBe(6);
    }
  });

  test('evaluate("1 + + 2") => Err(ParseError) at position 4', () => {
    const result = evaluate("1 + + 2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.position).toBe(4);
    }
  });

  test('evaluate("1 + -2") => -1', () => {
    const result = evaluate("1 + -2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-1);
    }
  });

  test('evaluate("1.5 + 2") => 3.5', () => {
    const result = evaluate("1.5 + 2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(3.5);
    }
  });

  test('evaluate("1 - -2") => 3', () => {
    const result = evaluate("1 - -2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(3);
    }
  });

  test('evaluate("+1") => Err(ParseError) at position 0', () => {
    const result = evaluate("+1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.position).toBe(0);
    }
  });
});
