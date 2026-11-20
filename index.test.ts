import { expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

test('evaluateTuff("1") => 1', () => {
  expect(evaluateTuff("1")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("1 + 2") => 3', () => {
  expect(evaluateTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test("empty and whitespace-only input is an UnexpectedEnd error, not 0", () => {
  expect(evaluateTuff("")).toEqual({ ok: false, error: { kind: "UnexpectedEnd", span: { start: 0, end: 0 } } });
  expect(evaluateTuff("  ")).toEqual({ ok: false, error: { kind: "UnexpectedEnd", span: { start: 2, end: 2 } } });
});

test('evaluateTuff("abc") reports an UnexpectedCharacter error spanning "a"', () => {
  expect(evaluateTuff("abc")).toEqual({ ok: false, error: { kind: "UnexpectedCharacter", span: { start: 0, end: 1 } } });
});

test('evaluateTuff("1 / 0") is a DivisionByZero error spanning the "/"', () => {
  expect(evaluateTuff("1 / 0")).toEqual({ ok: false, error: { kind: "DivisionByZero", span: { start: 2, end: 3 } } });
});

test("hex and exponent forms are rejected", () => {
  expect(evaluateTuff("0x10")).toEqual({ ok: false, error: { kind: "UnexpectedCharacter", span: { start: 1, end: 2 } } });
  expect(evaluateTuff("1e3")).toEqual({ ok: false, error: { kind: "UnexpectedCharacter", span: { start: 1, end: 2 } } });
});
