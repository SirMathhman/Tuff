import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("return 1;") => 1', () => {
    expect(evaluate("return 1;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("return 2;") => 2', () => {
    expect(evaluate("return 2;")).toEqual({ ok: true, value: 2 });
  });

  test('evaluate("return 3;") => 3', () => {
    expect(evaluate("return 3;")).toEqual({ ok: true, value: 3 });
  });

  test('evaluate("return 4;") => 4', () => {
    expect(evaluate("return 4;")).toEqual({ ok: true, value: 4 });
  });

  test('evaluate("return 5;") => structured unhandled_input error', () => {
    const result = evaluate("return 5;");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unhandled_input");
      expect(result.error.input).toBe("return 5;");
      expect(result.error.reason).toContain("return 5;");
      expect(result.error.fix).toBeTruthy();
    }
  });
});
