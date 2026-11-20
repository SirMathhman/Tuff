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

test('evaluateTuff("{ 2 + 3 } * 4") => 20', () => {
  expect(evaluateTuff("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test('evaluateTuff("0 / 0") is a DivisionByZero error spanning the "/"', () => {
  expect(evaluateTuff("0 / 0")).toEqual({ ok: false, error: { kind: "DivisionByZero", span: { start: 2, end: 3 } } });
});

test('evaluateTuff("7 / 2") => 3 (integer division)', () => {
  expect(evaluateTuff("7 / 2")).toEqual({ ok: true, value: 3 });
});

test("a literal that overflows to Infinity is a NumericOverflow error", () => {
  const literal = "1" + "0".repeat(400);
  expect(evaluateTuff(literal)).toEqual({ ok: false, error: { kind: "NumericOverflow", span: { start: 0, end: 401 } } });
});

test("nesting deeper than 256 groups is a NestingTooDeep error, not a stack crash", () => {
  const source = "(".repeat(257) + "1" + ")".repeat(257);
  expect(evaluateTuff(source)).toEqual({ ok: false, error: { kind: "NestingTooDeep", span: { start: 256, end: 257 } } });
});

test("hex and exponent forms are rejected", () => {
  expect(evaluateTuff("0x10")).toEqual({ ok: false, error: { kind: "UnexpectedCharacter", span: { start: 1, end: 2 } } });
  expect(evaluateTuff("1e3")).toEqual({ ok: false, error: { kind: "UnexpectedCharacter", span: { start: 1, end: 2 } } });
});
