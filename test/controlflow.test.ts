import { describe, expect, test } from "bun:test";
import { evalBreak, evalOk, evalReturn, evalYield, unwrap, type Value } from "../src/value";
import { isTerminal, shouldPropagate } from "../src/controlflow";

const numVal: Value = { kind: "number", value: 1 };

describe("controlflow", () => {
  test("isTerminal returns false for value", () => {
    expect(isTerminal(evalOk(numVal))).toBe(false);
  });

  test("isTerminal returns true for break", () => {
    expect(isTerminal(evalBreak(numVal))).toBe(true);
  });

  test("isTerminal returns true for yield", () => {
    expect(isTerminal(evalYield(numVal))).toBe(true);
  });

  test("isTerminal returns true for return", () => {
    expect(isTerminal(evalReturn(numVal))).toBe(true);
  });

  test("shouldPropagate returns true for yield in block", () => {
    expect(shouldPropagate(evalYield(numVal), "block")).toBe(true);
  });

  test("shouldPropagate returns false for break in block", () => {
    expect(shouldPropagate(evalBreak(numVal), "block")).toBe(false);
  });

  test("shouldPropagate returns true for break in loop", () => {
    expect(shouldPropagate(evalBreak(numVal), "loop")).toBe(true);
  });

  test("shouldPropagate returns false for yield in loop", () => {
    expect(shouldPropagate(evalYield(numVal), "loop")).toBe(false);
  });

  test("shouldPropagate returns true for return in expression", () => {
    expect(shouldPropagate(evalReturn(numVal), "expression")).toBe(true);
  });

  test("shouldPropagate returns false for break in expression", () => {
    expect(shouldPropagate(evalBreak(numVal), "expression")).toBe(false);
  });

  test("unwrap throws for unknown result kind", () => {
    const unknownResult = { kind: "unknown_kind", value: numVal } as never;
    expect(() => unwrap(unknownResult)).toThrow("Unexpected unknown_kind");
  });
});
