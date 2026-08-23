import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

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
  });
});
