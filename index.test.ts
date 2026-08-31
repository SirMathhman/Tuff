import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toEqual({ ok: true, value: 0 });
});

test('evaluate("1") => 1', () => {
  expect(evaluate("1")).toEqual({ ok: true, value: 1 });
});

test('evaluate("12") => 12', () => {
  expect(evaluate("12")).toEqual({ ok: true, value: 12 });
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

test('evaluate("   ") => 0', () => {
  expect(evaluate("   ")).toEqual({ ok: true, value: 0 });
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

test('evaluate("{ let x = 2 + 3; let y = x; y } * 4") => 20', () => {
  expect(evaluate("{ let x = 2 + 3; let y = x; y } * 4")).toEqual({
    ok: true,
    value: 20,
  });
});

test('evaluate("let z = { let x = 2 + 3; let y = x; y } * 4; z") => 20', () => {
  expect(evaluate("let z = { let x = 2 + 3; let y = x; y } * 4; z")).toEqual({
    ok: true,
    value: 20,
  });
});

test('evaluate("let x = 0; let x = 1; x") => 1', () => {
  expect(evaluate("let x = 0; let x = 1; x")).toEqual({ ok: true, value: 1 });
});

test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toEqual({ ok: true, value: 1 });
});

test('evaluate("let y = { let x = 0; x }; x") => Err', () => {
  expect(evaluate("let y = { let x = 0; x }; x")).toEqual({
    ok: false,
    error: {
      kind: "undefined",
      message: "undefined variable x",
      position: 26,
    },
  });
});

test('evaluate("let x = 2; let y = { let x = 0; x }; x") => 2', () => {
  expect(evaluate("let x = 2; let y = { let x = 0; x }; x")).toEqual({
    ok: true,
    value: 2,
  });
});
