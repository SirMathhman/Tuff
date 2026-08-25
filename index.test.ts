import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

describe("evaluateTuff", () => {
  test("empty string returns 0", () => {
    expect(evaluateTuff("")).toEqual({ ok: true, value: 0 });
  });

  test("return statement returns the number", () => {
    expect(evaluateTuff("return 1;")).toEqual({ ok: true, value: 1 });
  });
  test("let declaration then return variable", () => {
    expect(evaluateTuff("let x = 1; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });
  test("redeclaration shadows previous value", () => {
    expect(evaluateTuff("let x = 1; let x = 2; return x;")).toEqual({
      ok: true,
      value: 2,
    });
  });
  test("mut declaration then assignment", () => {
    expect(evaluateTuff("let mut x = 0; x = 1; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });
  test("return of unknown identifier returns Err", () => {
    expect(evaluateTuff("return unknownIdentifier;")).toEqual({
      ok: false,
      error: { type: "UnknownIdentifier", name: "unknownIdentifier" },
    });
  });
});
