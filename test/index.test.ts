import { describe, expect, test } from "bun:test";
import { evaluateTuff, TuffErrorReason } from "../src/index.ts";

describe("evaluateTuff basics", () => {
  test("empty source fails with EmptySource", () => {
    expect(evaluateTuff("")).toEqual({
      ok: false,
      error: {
        reason: TuffErrorReason.EmptySource,
        source: "",
        position: -1,
      },
    });
  });

  test('numeric source "1" evaluates to 1', () => {
    expect(evaluateTuff("1")).toEqual({ ok: true, value: 1 });
  });

  test('arithmetic source "1 + 2" evaluates to 3', () => {
    expect(evaluateTuff("1 + 2")).toEqual({ ok: true, value: 3 });
  });

  test("non-numeric source fails with NotANumber", () => {
    expect(evaluateTuff("abc")).toEqual({
      ok: false,
      error: {
        reason: TuffErrorReason.NotANumber,
        source: "abc",
        position: 0,
      },
    });
  });
});

describe("evaluateTuff error positions", () => {
  test("mid-expression failure reports the offending position", () => {
    expect(evaluateTuff("1 + abc")).toEqual({
      ok: false,
      error: {
        reason: TuffErrorReason.NotANumber,
        source: "1 + abc",
        position: 4,
      },
    });
  });

  test("trailing token failure reports the offending position", () => {
    expect(evaluateTuff("1 2")).toEqual({
      ok: false,
      error: {
        reason: TuffErrorReason.InvalidExpression,
        source: "1 2",
        position: 2,
      },
    });
  });

  test("unbalanced parenthesis reports the position", () => {
    expect(evaluateTuff("(1 + 2")).toEqual({
      ok: false,
      error: {
        reason: TuffErrorReason.InvalidExpression,
        source: "(1 + 2",
        position: 0,
      },
    });
  });
});
