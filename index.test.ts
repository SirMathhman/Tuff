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
  expect(interpretTuff("{ let x = 2 + 3; x } * 4")).toEqual({
    ok: true,
    value: 20,
  });
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
  expect(interpretTuff("let mut x = 0; x = 1; x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let mut x = 0; let y = { x = 1; x }; x") => 1', () => {
  expect(interpretTuff("let mut x = 0; let y = { x = 1; x }; x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let mut x = 0; let y = { let mut x = 5; x = 6; x }; x") => 0', () => {
  expect(
    interpretTuff("let mut x = 0; let y = { let mut x = 5; x = 6; x }; x"),
  ).toEqual({
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

test("interpretTuff with 1001 nested parentheses => nesting too deep error", () => {
  expect(interpretTuff("(".repeat(1001) + "1" + ")".repeat(1001))).toEqual({
    ok: false,
    error: {
      what: "Nesting too deep",
      where: 1000,
      why: "Groups nest more than 1000 levels deep",
      fix: "Reduce the nesting of parentheses and braces",
    },
  });
});

test('interpretTuff("let x = 1; let y = &x; *y") => 1', () => {
  expect(interpretTuff("let x = 1; let y = &x; *y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let mut x = 1; let y = &mut x; *y = 2; x") => 2', () => {
  expect(interpretTuff("let mut x = 1; let y = &mut x; *y = 2; x")).toEqual({
    ok: true,
    value: 2,
  });
});

test('interpretTuff("let x = 1; let y = &x; *y = 2; x") => read-only reference error', () => {
  expect(interpretTuff("let x = 1; let y = &x; *y = 2; x")).toEqual({
    ok: false,
    error: {
      what: "Read-only reference",
      where: 24,
      why: '"y" holds a read-only reference, so it cannot be written through',
      fix: "Borrow the variable with &mut to allow writing through *y",
    },
  });
});

test('interpretTuff("let a = 1; let mut r = &a; let z = { let b = 2; r = &b; 0 }; *r") => escape error', () => {
  expect(
    interpretTuff(
      "let a = 1; let mut r = &a; let z = { let b = 2; r = &b; 0 }; *r",
    ),
  ).toEqual({
    ok: false,
    error: {
      what: "Reference escapes block",
      where: 58,
      why: '"r" would refer to a variable that ends with this block',
      fix: "Point the outer variable at a variable that lives as long as it does",
    },
  });
});

test('interpretTuff("let x = 1; let y = &x; y") => reference used as a number error', () => {
  expect(interpretTuff("let x = 1; let y = &x; y")).toEqual({
    ok: false,
    error: {
      what: "Reference used as a number",
      where: 23,
      why: '"y" holds a reference, not a number',
      fix: "Write *y to use the value it points at",
    },
  });
});

test('interpretTuff("let x = 1; *x") => not a reference error', () => {
  expect(interpretTuff("let x = 1; *x")).toEqual({
    ok: false,
    error: {
      what: "Not a reference",
      where: 12,
      why: '"x" does not hold a reference',
      fix: "Only a variable that holds &x or &mut x can be dereferenced",
    },
  });
});

test('interpretTuff("let x = 1; let y = &mut x; y") => cannot borrow mutably error', () => {
  expect(interpretTuff("let x = 1; let y = &mut x; y")).toEqual({
    ok: false,
    error: {
      what: "Cannot borrow mutably",
      where: 24,
      why: '"x" was declared with let, so it cannot be borrowed with &mut',
      fix: "Declare it with let mut x = ...; to allow &mut",
    },
  });
});

test('interpretTuff("let x = true; x") => 1', () => {
  expect(interpretTuff("let x = true; x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff with 10001 characters => source too long error", () => {
  expect(interpretTuff("1".repeat(10001))).toEqual({
    ok: false,
    error: {
      what: "Source too long",
      where: 10000,
      why: "The source is longer than 10000 characters",
      fix: "Split the program into shorter sources",
    },
  });
});

test('interpretTuff("true && false") => 0', () => {
  expect(interpretTuff("true && false")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("true || false && false") => 1 (&& binds tighter)', () => {
  expect(interpretTuff("true || false && false")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let mut x = 0; let y = false && { x = 1; true }; x") => 0 (right side skipped)', () => {
  expect(
    interpretTuff("let mut x = 0; let y = false && { x = 1; true }; x"),
  ).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("true || false") => 1', () => {
  expect(interpretTuff("true || false")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("let mut x = 0; let y = true || { x = 1; true }; x") => 0 (right side skipped)', () => {
  expect(
    interpretTuff("let mut x = 0; let y = true || { x = 1; true }; x"),
  ).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("let mut x = 0; let y = false || { x = 1; true }; x") => 1', () => {
  expect(
    interpretTuff("let mut x = 0; let y = false || { x = 1; true }; x"),
  ).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("1 || true") => number used as a boolean error', () => {
  expect(interpretTuff("1 || true")).toEqual({
    ok: false,
    error: {
      what: "Number used as a boolean",
      where: 2,
      why: 'Both sides of "||" must be booleans',
      fix: 'Use a boolean on each side of "||", or remove the number',
    },
  });
});

test('interpretTuff("false") => 0', () => {
  expect(interpretTuff("false")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("let x = true; let y = &x; *y") => 1', () => {
  expect(interpretTuff("let x = true; let y = &x; *y")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let x = true; x + 1") => boolean used as a number error', () => {
  expect(interpretTuff("let x = true; x + 1")).toEqual({
    ok: false,
    error: {
      what: "Boolean used as a number",
      where: 14,
      why: '"x" is a boolean, not a number',
      fix: "Use a number instead of the boolean, or drop the operator",
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

test('interpretTuff("2 < 3") => 1', () => {
  expect(interpretTuff("2 < 3")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("3 < 2") => 0', () => {
  expect(interpretTuff("3 < 2")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("1 + 1 < 3 && true") => 1 (< binds tighter than &&)', () => {
  expect(interpretTuff("1 + 1 < 3 && true")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("1 < 2 < 3") => chained comparison error', () => {
  expect(interpretTuff("1 < 2 < 3")).toEqual({
    ok: false,
    error: {
      what: "Chained comparison",
      where: 6,
      why: 'A comparison takes one "<", so another "<" cannot follow it',
      fix: 'Join the comparisons with "&&", or remove this "<"',
    },
  });
});

test('interpretTuff("true < 2") => boolean used as a number error', () => {
  expect(interpretTuff("true < 2")).toEqual({
    ok: false,
    error: {
      what: "Boolean used as a number",
      where: 0,
      why: '"true" is a boolean, not a number',
      fix: "Use a number instead of the boolean, or drop the operator",
    },
  });
});

test('interpretTuff("2 > 3") => 0', () => {
  expect(interpretTuff("2 > 3")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("2 <= 2") => 1', () => {
  expect(interpretTuff("2 <= 2")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("2 >= 3") => 0', () => {
  expect(interpretTuff("2 >= 3")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("2 == 2") => 1', () => {
  expect(interpretTuff("2 == 2")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("2 != 2") => 0', () => {
  expect(interpretTuff("2 != 2")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("2 < true") => boolean used as a number error', () => {
  expect(interpretTuff("2 < true")).toEqual({
    ok: false,
    error: {
      what: "Boolean used as a number",
      where: 4,
      why: '"true" is a boolean, not a number',
      fix: "Use a number instead of the boolean, or drop the operator",
    },
  });
});

test('interpretTuff("1 < 2 && 2 < 3") => 1', () => {
  expect(interpretTuff("1 < 2 && 2 < 3")).toEqual({ ok: true, value: 1 });
});
