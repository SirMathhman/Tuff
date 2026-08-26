import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

describe("evaluateTuff expressions", () => {
  test("return of unknown identifier returns Err", () => {
    expect(evaluateTuff("return unknownIdentifier;")).toEqual({
      ok: false,
      error: { type: "UnknownIdentifier", name: "unknownIdentifier" },
    });
  });
  test("boolean literal evaluates to 1", () => {
    expect(evaluateTuff("let x = true; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });
  test("logical or of booleans", () => {
    expect(evaluateTuff("let x = true; let y = false; return x || y;")).toEqual(
      {
        ok: true,
        value: 1,
      },
    );
  });
  test("equality of unequal numbers is 0", () => {
    expect(evaluateTuff("let x = 1; let y = 2; return x == y;")).toEqual({
      ok: true,
      value: 0,
    });
  });
});
