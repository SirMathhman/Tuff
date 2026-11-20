import { expect, test } from "bun:test";
import { evaluateTuff, TuffErrorKind } from "./index.ts";

test('evaluateTuff("1") => 1', () => {
  expect(evaluateTuff("1")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("1 + 2") => 3', () => {
  expect(evaluateTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test("empty and whitespace-only input is an UnexpectedEnd error, not 0", () => {
  expect(evaluateTuff("")).toEqual({ ok: false, error: { kind: TuffErrorKind.UnexpectedEnd, span: { start: 0, end: 0 } } });
  expect(evaluateTuff("  ")).toEqual({ ok: false, error: { kind: TuffErrorKind.UnexpectedEnd, span: { start: 2, end: 2 } } });
});

test('evaluateTuff("abc") is an UnknownName error spanning "abc"', () => {
  expect(evaluateTuff("abc")).toEqual({ ok: false, error: { kind: TuffErrorKind.UnknownName, span: { start: 0, end: 3 } } });
});

test('evaluateTuff("1 / 0") is a DivisionByZero error spanning the "/"', () => {
  expect(evaluateTuff("1 / 0")).toEqual({ ok: false, error: { kind: TuffErrorKind.DivisionByZero, span: { start: 2, end: 3 } } });
});

test('evaluateTuff("{ 2 + 3 } * 4") => 20', () => {
  expect(evaluateTuff("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test('evaluateTuff("0 / 0") is a DivisionByZero error spanning the "/"', () => {
  expect(evaluateTuff("0 / 0")).toEqual({ ok: false, error: { kind: TuffErrorKind.DivisionByZero, span: { start: 2, end: 3 } } });
});

test('evaluateTuff("7 / 2") => 3 (integer division)', () => {
  expect(evaluateTuff("7 / 2")).toEqual({ ok: true, value: 3 });
});

test("a literal that overflows to Infinity is a NumericOverflow error", () => {
  const literal = "1" + "0".repeat(400);
  expect(evaluateTuff(literal)).toEqual({ ok: false, error: { kind: TuffErrorKind.NumericOverflow, span: { start: 0, end: 401 } } });
});

test("nesting deeper than 256 groups is a NestingTooDeep error, not a stack crash", () => {
  const source = "(".repeat(257) + "1" + ")".repeat(257);
  expect(evaluateTuff(source)).toEqual({ ok: false, error: { kind: TuffErrorKind.NestingTooDeep, span: { start: 256, end: 257 } } });
});

test('evaluateTuff("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(evaluateTuff("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
});

test('evaluateTuff("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(evaluateTuff("let y = { let x = 2 + 3; x } * 4; y")).toEqual({ ok: true, value: 20 });
});

test('evaluateTuff("x") is an UnknownName error spanning "x"', () => {
  expect(evaluateTuff("x")).toEqual({ ok: false, error: { kind: TuffErrorKind.UnknownName, span: { start: 0, end: 1 } } });
});

test("re-declaring a name in the same block is a DuplicateName error", () => {
  expect(evaluateTuff("{ let x = 1; let x = 2; x }")).toEqual({ ok: false, error: { kind: TuffErrorKind.DuplicateName, span: { start: 17, end: 18 } } });
});

test("hex and exponent forms are rejected", () => {
  expect(evaluateTuff("0x10")).toEqual({ ok: false, error: { kind: TuffErrorKind.UnexpectedToken, span: { start: 1, end: 2 } } });
  expect(evaluateTuff("1e3")).toEqual({ ok: false, error: { kind: TuffErrorKind.UnexpectedToken, span: { start: 1, end: 2 } } });
});
