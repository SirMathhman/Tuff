import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("1") => 1', () => {
    expect(evaluate("1")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("1 + 2") => 3', () => {
    expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
  });

  test('evaluate("1 + 2 + 3") => 6', () => {
    expect(evaluate("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
  });

  test('evaluate("1 +") => unexpected-end error', () => {
    expect(evaluate("1 +")).toEqual({
      ok: false,
      error: { kind: "unexpected-end", index: 3 },
    });
  });

  test('evaluate("abc") => invalid-token error', () => {
    expect(evaluate("abc")).toEqual({
      ok: false,
      error: { kind: "invalid-token", index: 0, token: "abc" },
    });
  });
});
