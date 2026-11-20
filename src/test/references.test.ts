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

test('interpretTuff("let mut x = 0; let y = &mut x; let z = &mut x;") => error', () => {
  expect(
    interpretTuff("let mut x = 0; let y = &mut x; let z = &mut x;"),
  ).toEqual({
    ok: false,
    error: {
      what: "'x' is already referenced in a way that conflicts with this reference",
      where: 44,
      why: "A '&mut' reference cannot coexist with any other reference to the same variable.",
      fix: "End the other reference's block, or use '&' for both references.",
    },
  });
});

test('interpretTuff("let mut x = 0; x = 1; *3") => error naming *', () => {
  expect(interpretTuff("let mut x = 0; x = 1; *3")).toEqual({
    ok: false,
    error: {
      what: "Expected a variable name after '*' but found '3'",
      where: 23,
      why: "A '*' must be followed by the name of a variable.",
      fix: "Write a name made of letters after '*'.",
    },
  });
});

test('interpretTuff("let x = 1; let y = &3;") => error naming &', () => {
  expect(interpretTuff("let x = 1; let y = &3;")).toEqual({
    ok: false,
    error: {
      what: "Expected a variable name after '&' but found '3'",
      where: 20,
      why: "A '&' must be followed by the name of a variable.",
      fix: "Write a name made of letters after '&'.",
    },
  });
});

test('interpretTuff("let mut x = 0; { x = 1; } * 2") => error without let', () => {
  expect(interpretTuff("let mut x = 0; { x = 1; } * 2")).toEqual({
    ok: false,
    error: {
      what: "Expected a variable name after '*' but found '2'",
      where: 28,
      why: "A '*' must be followed by the name of a variable.",
      fix: "Write a name made of letters after '*'.",
    },
  });
});

test('interpretTuff("let x = 1; let r = &x; r = 2; r") => error without let mut', () => {
  expect(interpretTuff("let x = 1; let r = &x; r = 2; r")).toEqual({
    ok: false,
    error: {
      what: "Cannot reassign reference 'r'",
      where: 23,
      why: "A reference always points to the same variable, so it cannot be given another one.",
      fix: "Declare a new variable with a different name instead.",
    },
  });
});
