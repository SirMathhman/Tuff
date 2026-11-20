import { expect, test } from "bun:test";
import { interpretTuff } from "../index";

test('interpretTuff("let x = 1; let y = &x; *y") => 1', () => {
  expect(interpretTuff("let x = 1; let y = &x; *y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let mut x = 0; let w = { let y = &mut x; *y = 1; 0 }; x") => 1', () => {
  expect(
    interpretTuff("let mut x = 0; let w = { let y = &mut x; *y = 1; 0 }; x"),
  ).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let x = { let y = 0; &y }; *x") => error', () => {
  expect(interpretTuff("let x = { let y = 0; &y }; *x")).toEqual({
    ok: false,
    error: {
      what: "'&' is only allowed as the whole value of a 'let' statement",
      where: 21,
      why: "A reference is bound to a variable by 'let', and cannot be part of a larger expression.",
      fix: "Write 'let name = &variable;', or remove the '&'.",
    },
  });
});

test('interpretTuff("let z = 1; let x = { &z }; *x") => 1', () => {
  expect(interpretTuff("let z = 1; let x = { &z }; *x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let z = 1; let x = if (true) { &z } else { &z }; *x") => 1', () => {
  expect(
    interpretTuff("let z = 1; let x = if (true) { &z } else { &z }; *x"),
  ).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("let z = 1; let x = if (false) { 0 } else { &z }; *x") => 1', () => {
  expect(
    interpretTuff("let z = 1; let x = if (false) { 0 } else { &z }; *x"),
  ).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("let z = 1; let x = { { &z } }; *x") => error', () => {
  expect(interpretTuff("let z = 1; let x = { { &z } }; *x")).toEqual({
    ok: false,
    error: {
      what: "'&' is only allowed as the whole value of a 'let' statement",
      where: 23,
      why: "A reference is bound to a variable by 'let', and cannot be part of a larger expression.",
      fix: "Write 'let name = &variable;', or remove the '&'.",
    },
  });
});

test('interpretTuff("let z = 1; let x = { &z }; *x + 1") => 2', () => {
  expect(interpretTuff("let z = 1; let x = { &z }; *x + 1")).toEqual({
    ok: true,
    value: 2,
  });
});
