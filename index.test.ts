import { expect, test } from "bun:test";
import { interpretTuff } from "./index.ts";

test('interpretTuff("1") => 1', () => {
  expect(interpretTuff("1")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("1 + 2") => 3', () => {
  expect(interpretTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test('interpretTuff("2 + 3 - 4") => 1', () => {
  expect(interpretTuff("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("2 * 3 + 4") => 10', () => {
  expect(interpretTuff("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
});

test('interpretTuff("2 + 3 * 4") => 14', () => {
  expect(interpretTuff("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
});

test('interpretTuff("2 * 3 * 4") => 24', () => {
  expect(interpretTuff("2 * 3 * 4")).toEqual({ ok: true, value: 24 });
});

test('interpretTuff("1 + 2 * 3 - 4 * 5") => -13', () => {
  expect(interpretTuff("1 + 2 * 3 - 4 * 5")).toEqual({ ok: true, value: -13 });
});

test('interpretTuff("(2 + 3) * 4") => 20', () => {
  expect(interpretTuff("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
});

test('interpretTuff("{ 2 + 3 } * 4") => 20', () => {
  expect(interpretTuff("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test('interpretTuff("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(interpretTuff("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
});

test('interpretTuff("{ let x = 1; x } + x") => undefined variable outside its block', () => {
  expect(interpretTuff("{ let x = 1; x } + x")).toEqual({
    ok: false,
    error: {
      what: "Undefined variable",
      where: 19,
      why: '"x" has not been declared',
      fix: "Declare it first with let x = ...;, or fix the spelling",
    },
  });
});

test('interpretTuff("let x = 1; let x = 2; x") => duplicate variable error', () => {
  expect(interpretTuff("let x = 1; let x = 2; x")).toEqual({
    ok: false,
    error: {
      what: "Duplicate variable",
      where: 15,
      why: '"x" is already declared in this block',
      fix: "Rename this variable, or delete this declaration",
    },
  });
});

test('interpretTuff("let x = 1 x") => missing semicolon error', () => {
  expect(interpretTuff("let x = 1 x")).toEqual({
    ok: false,
    error: {
      what: "Missing ;",
      where: 10,
      why: 'The let statement for "x" must end with ";"',
      fix: 'Add ";" after its value',
    },
  });
});

test('interpretTuff("let 1 = 2; 3") => missing name error', () => {
  expect(interpretTuff("let 1 = 2; 3")).toEqual({
    ok: false,
    error: {
      what: "Missing name",
      where: 4,
      why: 'Found "1" where a variable name is required',
      fix: 'Use a name made of letters and "_" after let, such as let x = 1;',
    },
  });
});

test('interpretTuff("1;") => unexpected semicolon error', () => {
  expect(interpretTuff("1;")).toEqual({
    ok: false,
    error: {
      what: "Unexpected semicolon",
      where: 1,
      why: 'A ";" may only end a let statement',
      fix: 'Delete this ";", or put a let statement before it',
    },
  });
});

test('interpretTuff("let mut x = 0; x = 1; x") => 1', () => {
  expect(interpretTuff("let mut x = 0; x = 1; x")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("let mut x = 0; let y = { x = 1; x }; x") => 1', () => {
  expect(interpretTuff("let mut x = 0; let y = { x = 1; x }; x")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("let mut x = 0; let y = { let mut x = 5; x = 6; x }; x") => 0', () => {
  expect(interpretTuff("let mut x = 0; let y = { let mut x = 5; x = 6; x }; x")).toEqual({
    ok: true,
    value: 0,
  });
});

test('interpretTuff("let x = 0; x = 1; x") => immutable variable error', () => {
  expect(interpretTuff("let x = 0; x = 1; x")).toEqual({
    ok: false,
    error: {
      what: "Immutable variable",
      where: 11,
      why: '"x" was declared with let, so it cannot be reassigned',
      fix: "Declare it with let mut x = ...; to allow reassignment",
    },
  });
});

test('interpretTuff("x = 1; x") => undefined variable error for assignment', () => {
  expect(interpretTuff("x = 1; x")).toEqual({
    ok: false,
    error: {
      what: "Undefined variable",
      where: 0,
      why: '"x" has not been declared',
      fix: "Declare it first with let mut x = ...;, or fix the spelling",
    },
  });
});

test('interpretTuff("{ 2 + 3") => error at the unmatched brace', () => {
  expect(interpretTuff("{ 2 + 3")).toEqual({
    ok: false,
    error: {
      what: "Unmatched brace",
      where: 0,
      why: 'The "{" at this position has no matching "}"',
      fix: 'Add a "}" after its expression, or delete this "{"',
    },
  });
});

test('interpretTuff("( 2 }") => error at the mismatched closer', () => {
  expect(interpretTuff("( 2 }")).toEqual({
    ok: false,
    error: {
      what: "Mismatched bracket",
      where: 4,
      why: 'This "}" does not match the "(" at position 0',
      fix: 'Change this to ")", or change the "(" to "{"',
    },
  });
});

test('interpretTuff("2 }") => error at the stray brace', () => {
  expect(interpretTuff("2 }")).toEqual({
    ok: false,
    error: {
      what: "Unmatched brace",
      where: 2,
      why: 'This "}" has no matching "{"',
      fix: 'Add a "{" before its expression, or delete this "}"',
    },
  });
});

const errorShape = {
  what: expect.any(String),
  where: expect.any(Number),
  why: expect.any(String),
  fix: expect.any(String),
};

test('interpretTuff("2 *") => error at end of input', () => {
  expect(interpretTuff("2 *")).toEqual({
    ok: false,
    error: {
      what: "Missing number",
      where: 3,
      why: "The expression ends where a number is required",
      fix: "Add a number after the last operator, or delete that operator",
    },
  });
});

test('interpretTuff("2 - * 3") => error at the operator', () => {
  expect(interpretTuff("2 - * 3")).toEqual({
    ok: false,
    error: {
      what: "Missing number",
      where: 4,
      why: 'Found "*" where a number is required',
      fix: "Put a number before this operator, or remove the operator before it",
    },
  });
});

test('interpretTuff("2 3") => error at the second number', () => {
  expect(interpretTuff("2 3")).toEqual({
    ok: false,
    error: {
      what: "Missing operator",
      where: 2,
      why: "Two numbers appear next to each other with no operator between them",
      fix: "Insert +, -, or * between the numbers, or delete one of them",
    },
  });
});

test('interpretTuff("1 + 2 +") => error has the full shape', () => {
  expect(interpretTuff("1 + 2 +")).toEqual({
    ok: false,
    error: errorShape,
  });
});

test('interpretTuff("2 $ 3") => unexpected character error', () => {
  expect(interpretTuff("2 $ 3")).toEqual({
    ok: false,
    error: {
      what: "Unexpected character",
      where: 2,
      why: '"$" is not a digit, an operator (+, -, *), or whitespace',
      fix: 'Remove "$" or replace it with a number or operator',
    },
  });
});
