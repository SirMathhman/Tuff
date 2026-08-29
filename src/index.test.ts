import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toEqual({ ok: true, value: 0 });
});

test('evaluate("1") => 1', () => {
  expect(evaluate("1")).toEqual({ ok: true, value: 1 });
});

test('evaluate("let x = true; x") => 1', () => {
  expect(evaluate("let x = true; x")).toEqual({ ok: true, value: 1 });
});

test('evaluate("let x = true; let y = false; x || y") => 1', () => {
  expect(evaluate("let x = true; let y = false; x || y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("let x = true; let y = false; x && y") => 0', () => {
  expect(evaluate("let x = true; let y = false; x && y")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluate("let x = true; let y = true; x && y") => 1', () => {
  expect(evaluate("let x = true; let y = true; x && y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("1 || 0 && 0") => 1', () => {
  expect(evaluate("1 || 0 && 0")).toEqual({ ok: true, value: 1 });
});

test('evaluate("let x = 1; let y = 2; x == y") => 0', () => {
  expect(evaluate("let x = 1; let y = 2; x == y")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluate("let x = 1; let y = 1; x == y") => 1', () => {
  expect(evaluate("let x = 1; let y = 1; x == y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("1 + 2 == 3 && 1") => 1', () => {
  expect(evaluate("1 + 2 == 3 && 1")).toEqual({ ok: true, value: 1 });
});

test('evaluate("true == 1") => type-mismatch error', () => {
  expect(evaluate("true == 1")).toEqual({
    ok: false,
    error: { kind: "type-mismatch", input: "true == 1", name: "" },
  });
});

test('evaluate("true == true") => 1', () => {
  expect(evaluate("true == true")).toEqual({ ok: true, value: 1 });
});

test('evaluate("let x = if (true) 2 else 3; x") => 2', () => {
  expect(evaluate("let x = if (true) 2 else 3; x")).toEqual({
    ok: true,
    value: 2,
  });
});

test('evaluate("let x = 0; let y = 1; x < y") => 1', () => {
  expect(evaluate("let x = 0; let y = 1; x < y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("let x = 1;") => 0', () => {
  expect(evaluate("let x = 1;")).toEqual({ ok: true, value: 0 });
});

test('evaluate("let mut x = 0; x = 1;") => 0', () => {
  expect(evaluate("let mut x = 0; x = 1;")).toEqual({ ok: true, value: 0 });
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

test('evaluate("let x = 1; let y = x; y") => 1', () => {
  expect(evaluate("let x = 1; let y = x; y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("let x = 1; let y = &x; *y") => 1', () => {
  expect(evaluate("let x = 1; let y = &x; *y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("let x = 1; let y = &x; let x = 2; *y") => 1', () => {
  expect(evaluate("let x = 1; let y = &x; let x = 2; *y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("let mut x = 0; let y = &mut x; *y = 1; x") => 1', () => {
  expect(evaluate("let mut x = 0; let y = &mut x; *y = 1; x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("let mut x = 0; let y = &mut x; let x = 2; *y = 1; x") => 1', () => {
  expect(
    evaluate("let mut x = 0; let y = &mut x; let x = 2; *y = 1; x"),
  ).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluate("let x = 0; x = 1; x") => immutable-assignment error', () => {
  expect(evaluate("let x = 0; x = 1; x")).toEqual({
    ok: false,
    error: {
      kind: "immutable-assignment",
      input: "let x = 0; x = 1; x",
      name: "x",
    },
  });
});

test('evaluate("let x = 1; x = 2; x") => immutable-assignment error', () => {
  expect(evaluate("let x = 1; x = 2; x")).toEqual({
    ok: false,
    error: {
      kind: "immutable-assignment",
      input: "let x = 1; x = 2; x",
      name: "x",
    },
  });
});

test('evaluate("x = 1; x") => immutable-assignment error', () => {
  expect(evaluate("x = 1; x")).toEqual({
    ok: false,
    error: {
      kind: "immutable-assignment",
      input: "x = 1; x",
      name: "x",
    },
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

test('evaluate("let x = 0; &x") => ref-as-result error', () => {
  expect(evaluate("let x = 0; &x")).toEqual({
    ok: false,
    error: { kind: "ref-as-result", input: "let x = 0; &x", name: "" },
  });
});

test('evaluate("let mut = 1;") => syntax error', () => {
  expect(evaluate("let mut = 1;")).toEqual({
    ok: false,
    error: { kind: "syntax", input: "let mut = 1;", position: 8 },
  });
});
