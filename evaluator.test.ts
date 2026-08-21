import { describe, expect, test } from "bun:test";
import { evaluate } from "./evaluator.ts";

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

  test('evaluate("2 + 3 - 4") => 1', () => {
    expect(evaluate("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("2 * 3 + 4") => 10', () => {
    expect(evaluate("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
  });

  test('evaluate("2 + 3 * 4") => 14', () => {
    expect(evaluate("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
  });

  test('evaluate("(2 + 3) * 4") => 20', () => {
    expect(evaluate("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
  });

  test('evaluate("{ 2 + 3 } * 4") => 20', () => {
    expect(evaluate("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
  });

  test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
    expect(evaluate("{ let x = 2 + 3; x } * 4")).toEqual({
      ok: true,
      value: 20,
    });
  });

  test('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
    expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toEqual({
      ok: true,
      value: 20,
    });
  });

  test('evaluate("let x = 1;") => 0', () => {
    expect(evaluate("let x = 1;")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("let y = { let x = 1; };") => error', () => {
    expect(evaluate("let y = { let x = 1; };")).toEqual({
      ok: false,
      error: { kind: "invalid-token", index: 21, token: "}" },
    });
  });

  test('evaluate("1 +") => unexpected-end error', () => {
    expect(evaluate("1 +")).toEqual({
      ok: false,
      error: { kind: "unexpected-end", index: 3 },
    });
  });

  test('evaluate("abc") => unknown-variable error', () => {
    expect(evaluate("abc")).toEqual({
      ok: false,
      error: { kind: "unknown-variable", index: 0, name: "abc" },
    });
  });
});
