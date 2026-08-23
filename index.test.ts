import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";
import type { EvalError } from "./src/errors.ts";

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("return 1;") => 1', () => {
    expect(evaluate("return 1;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let x = 1; return x;") => 1', () => {
    expect(evaluate("let x = 1; return x;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let mut x = 0; x = 1; return x;") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; return x;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let x = 0; x = 1; return x;") => Err', () => {
    const r = evaluate("let x = 0; x = 1; return x;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("mutability");
      expect(r.error.position).toEqual({ line: 1, column: 12 });
      expect(r.error.snippet).toBe("let x = 0; x = 1; return x;");
    }
  });

  test('evaluate("let x = 1;") => Err (no return)', () => {
    const r = evaluate("let x = 1;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
    }
  });

  test('evaluate("let x = 1; return y;") => Err (undefined variable)', () => {
    const r = evaluate("let x = 1; return y;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("y");
    }
  });

  test('evaluate("return 1 + 2 * 3;") => 7', () => {
    expect(evaluate("return 1 + 2 * 3;")).toEqual({ ok: true, value: 7 });
  });

  test('evaluate("let x = 1; let y = &x; return *y;") => 1', () => {
    expect(evaluate("let x = 1; let y = &x; return *y;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let mut x = 0; let y = &mut x; *y = 1; return x;") => 1', () => {
    expect(evaluate("let mut x = 0; let y = &mut x; *y = 1; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });
});
