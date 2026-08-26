import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

describe("evaluateTuff", () => {
  test('evaluateTuff("") => 0', () => {
    expect(evaluateTuff("")).toEqual({ ok: true, value: 0 });
  });

  test('evaluateTuff("return 1;") => 1', () => {
    expect(evaluateTuff("return 1;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluateTuff("let x = 1; return x;") => 1', () => {
    expect(evaluateTuff("let x = 1; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluateTuff("let x = 1; let y = x; return y;") => 1', () => {
    expect(evaluateTuff("let x = 1; let y = x; return y;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluateTuff("let x = 1; let y = 2; return y;") => 2', () => {
    expect(evaluateTuff("let x = 1; let y = 2; return y;")).toEqual({
      ok: true,
      value: 2,
    });
  });

  test('evaluateTuff("return unidentifiedIdentifier;") => Err', () => {
    const result = evaluateTuff("return unidentifiedIdentifier;");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        kind: "UnidentifiedIdentifier",
        name: "unidentifiedIdentifier",
        line: 1,
      });
    }
  });

  test('evaluateTuff("let x = missing; return x;") => Err', () => {
    const result = evaluateTuff("let x = missing; return x;");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        kind: "UnidentifiedIdentifier",
        name: "missing",
        line: 1,
      });
    }
  });
});
