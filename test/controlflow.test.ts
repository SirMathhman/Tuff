import { describe, expect, test } from "bun:test";
import { evalBreak, evalOk, evalYield, unwrap, type Value } from "../src/value";
import {
  isBlockTerminal,
  isLoopTerminal,
  isTerminal,
} from "../src/controlflow";

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

  test("isBlockTerminal returns true for yield", () => {
    expect(isBlockTerminal(evalYield(numVal))).toBe(true);
  });

  test("isBlockTerminal returns false for break", () => {
    expect(isBlockTerminal(evalBreak(numVal))).toBe(false);
  });

  test("isLoopTerminal returns true for break", () => {
    expect(isLoopTerminal(evalBreak(numVal))).toBe(true);
  });

  test("isLoopTerminal returns false for yield", () => {
    expect(isLoopTerminal(evalYield(numVal))).toBe(false);
  });

  test("unwrap throws for unknown result kind", () => {
    const unknownResult = { kind: "unknown_kind", value: numVal } as never;
    expect(() => unwrap(unknownResult)).toThrow("Unexpected unknown_kind");
  });
});
