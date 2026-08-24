import { test, expect } from "bun:test";
import { evaluateTuff } from "./index.js";
import { TuffErrorKind } from "./errors.js";

test('evaluateTuff("") returns ok with value 0', () => {
  expect(evaluateTuff("")).toEqual({ ok: true, value: 0 });
});

test('evaluateTuff("return 1;") returns ok with value 1', () => {
  expect(evaluateTuff("return 1;")).toEqual({ ok: true, value: 1 });
});

test("evaluateTuff with a syntax error returns a structured SyntaxError", () => {
  const result = evaluateTuff("return 1 +;");
  expect(result.ok).toBe(false);
  expect(result.error.kind).toBe(TuffErrorKind.SyntaxError);
  expect(result.error.input).toBe("return 1 +;");
});

test("evaluateTuff with an unknown identifier returns a structured RuntimeError", () => {
  const result = evaluateTuff("return x;");
  expect(result.ok).toBe(false);
  expect(result.error.kind).toBe(TuffErrorKind.RuntimeError);
});

test("evaluateTuff does not expose host globals", () => {
  expect(evaluateTuff("return typeof process;")).toEqual({
    ok: true,
    value: "undefined",
  });
});
