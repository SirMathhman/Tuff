import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toEqual({ ok: true, value: 0 });
});

test('evaluate("1") => 1', () => {
  expect(evaluate("1")).toEqual({ ok: true, value: 1 });
});

test('evaluate("1 + 2") => 3', () => {
  expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
});

test('evaluate("1 + 2 + 3") => 6', () => {
  expect(evaluate("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
});

test('evaluate("2 + 3 - 4") => 1', () => {
  expect(evaluate("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test('evaluate("2 * 3 + 4") => 10', () => {
  expect(evaluate("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
});

test('evaluate("2 + 3 * 4") => 14', () => {
  expect(evaluate("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
});

test('evaluate("(2 + 3) * 4") => 20', () => {
  expect(evaluate("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
});

test('evaluate("{ 2 + 3 } * 4") => 20', () => {
  expect(evaluate("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(evaluate("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
});

test('evaluate("{ let x = 2 + 3; let y = 1; y } * 4") => 4', () => {
  expect(evaluate("{ let x = 2 + 3; let y = 1; y } * 4")).toEqual({
    ok: true,
    value: 4,
  });
});

test('evaluate("{ let x = 2 + 3; let x = 1; x } * 4") => 4', () => {
  expect(evaluate("{ let x = 2 + 3; let x = 1; x } * 4")).toEqual({
    ok: true,
    value: 4,
  });
});

test('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toEqual({
    ok: true,
    value: 20,
  });
});

test('evaluate("{ 2 + 3 )") => syntax error', () => {
  expect(evaluate("{ 2 + 3 )")).toEqual({
    ok: false,
    error: { kind: "syntax", input: "{ 2 + 3 )", position: 8 },
  });
});

test('evaluate("( 2 + 3 }") => syntax error', () => {
  expect(evaluate("( 2 + 3 }")).toEqual({
    ok: false,
    error: { kind: "syntax", input: "( 2 + 3 }", position: 8 },
  });
});

test('evaluate("{ let x = y; x }") => error naming y', () => {
  expect(evaluate("{ let x = y; x }")).toEqual({
    ok: false,
    error: { kind: "unknown-variable", input: "{ let x = y; x }", name: "y" },
  });
});

test('evaluate("abc") => error', () => {
  expect(evaluate("abc")).toEqual({
    ok: false,
    error: { kind: "unknown-variable", input: "abc", name: "abc" },
  });
});
