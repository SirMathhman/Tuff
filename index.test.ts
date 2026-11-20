import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

const NUMBER_WHY =
  "Every '+', '-', or '*' must be followed by an integer, a variable, or a parenthesized or braced expression, and an expression must start with one.";
const NUMBER_FIX =
  "Put an integer, a variable, '(' or '{' at this position, or remove the operator before it.";
const OPERATOR_WHY =
  "Two numbers can only be combined with '+', '-', or '*'; any other character cannot follow a number.";
const OPERATOR_FIX =
  "Insert '+', '-', or '*' between the numbers, or remove the extra character.";
const GROUPED_OPERATOR_WHY =
  "Two terms can only be combined with '+', '-', or '*', and an opening bracket must be closed by its matching bracket; any other character cannot follow a number.";
const GROUPED_OPERATOR_FIX =
  "Insert '+', '-', '*', or a closing bracket here, or remove the extra character.";
const UNDEFINED_WHY =
  "A variable is only visible inside the block where it was declared with 'let', and inside blocks nested in that block.";
const MISMATCH_WHY =
  "Each opening bracket must be closed by its own kind of bracket: '(' by ')' and '{' by '}'.";
const MISMATCH_FIX =
  "Replace this character with ')', or change the opening bracket.";
const PAREN_CLOSE_WHY = "Every '(' must be closed by a matching ')'.";
const PAREN_CLOSE_FIX = "Add a ')' at the end of the parenthesized expression.";
const BRACE_CLOSE_WHY = "Every '{' must be closed by a matching '}'.";
const BRACE_CLOSE_FIX = "Add a '}' at the end of the braced expression.";

test('interpretTuff("5") => 5', () => {
  expect(interpretTuff("5")).toEqual({ ok: true, value: 5 });
});

test('interpretTuff("1 + 2") => 3', () => {
  expect(interpretTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test('interpretTuff("1 + 2 + 3") => 6', () => {
  expect(interpretTuff("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
});

test('interpretTuff("2 + 3 - 4") => 1', () => {
  expect(interpretTuff("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("2x") => error', () => {
  expect(interpretTuff("2x")).toEqual({
    ok: false,
    error: {
      what: "Expected '+', '-', or '*' but found 'x'",
      where: 1,
      why: OPERATOR_WHY,
      fix: OPERATOR_FIX,
    },
  });
});

test('interpretTuff("1.9 + 1") => error', () => {
  expect(interpretTuff("1.9 + 1")).toEqual({
    ok: false,
    error: {
      what: "Expected '+', '-', or '*' but found '.'",
      where: 1,
      why: OPERATOR_WHY,
      fix: OPERATOR_FIX,
    },
  });
});

test('interpretTuff("1 + x") => error', () => {
  expect(interpretTuff("1 + x")).toEqual({
    ok: false,
    error: {
      what: "Name 'x' is not defined",
      where: 4,
      why: UNDEFINED_WHY,
      fix: "Declare it with 'let x = ...;' before using it, in this block or an enclosing one.",
    },
  });
});

test('interpretTuff("") => error', () => {
  expect(interpretTuff("")).toEqual({
    ok: false,
    error: {
      what: "Expected a number, a variable, '(', or '{' but found the end of the input",
      where: 0,
      why: NUMBER_WHY,
      fix: NUMBER_FIX,
    },
  });
});

test('interpretTuff("  3  + 4") => 7', () => {
  expect(interpretTuff("  3  + 4")).toEqual({ ok: true, value: 7 });
});

test('interpretTuff("1 + -2") => -1', () => {
  expect(interpretTuff("1 + -2")).toEqual({ ok: true, value: -1 });
});

test('interpretTuff("2 * 3 + 4") => 10', () => {
  expect(interpretTuff("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
});

test('interpretTuff("2 + 3 * 4") => 14', () => {
  expect(interpretTuff("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
});

test('interpretTuff("(2 + 3) * 4") => 20', () => {
  expect(interpretTuff("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
});

test('interpretTuff("{ 2 + 3 } * 4") => 20', () => {
  expect(interpretTuff("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test('interpretTuff("(2 + 3 }") => error', () => {
  expect(interpretTuff("(2 + 3 }")).toEqual({
    ok: false,
    error: {
      what: "Expected ')' to close '(' but found '}'",
      where: 7,
      why: MISMATCH_WHY,
      fix: MISMATCH_FIX,
    },
  });
});

test('interpretTuff("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(interpretTuff("{ let x = 2 + 3; x } * 4")).toEqual({
    ok: true,
    value: 20,
  });
});

test('interpretTuff("let x = 1;") => 0', () => {
  expect(interpretTuff("let x = 1;")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("{ let x = 1; }") => error', () => {
  expect(interpretTuff("{ let x = 1; }")).toEqual({
    ok: false,
    error: {
      what: "Expected a number, a variable, '(', or '{' but found '}'",
      where: 13,
      why: NUMBER_WHY,
      fix: NUMBER_FIX,
    },
  });
});

test('interpretTuff("{ let x = 1; x } + x") => error', () => {
  expect(interpretTuff("{ let x = 1; x } + x")).toEqual({
    ok: false,
    error: {
      what: "Name 'x' is not defined",
      where: 19,
      why: UNDEFINED_WHY,
      fix: "Declare it with 'let x = ...;' before using it, in this block or an enclosing one.",
    },
  });
});

test('interpretTuff("-(2 + 3) * 4") => -20', () => {
  expect(interpretTuff("-(2 + 3) * 4")).toEqual({ ok: true, value: -20 });
});

test('interpretTuff("2 * -3") => -6', () => {
  expect(interpretTuff("2 * -3")).toEqual({ ok: true, value: -6 });
});

test('interpretTuff("-5") => -5', () => {
  expect(interpretTuff("-5")).toEqual({ ok: true, value: -5 });
});

test('interpretTuff("(2 + 3") => error', () => {
  expect(interpretTuff("(2 + 3")).toEqual({
    ok: false,
    error: {
      what: "Expected ')' but found the end of the input",
      where: 6,
      why: PAREN_CLOSE_WHY,
      fix: PAREN_CLOSE_FIX,
    },
  });
});

test('interpretTuff("{ 2 + 3") => error', () => {
  expect(interpretTuff("{ 2 + 3")).toEqual({
    ok: false,
    error: {
      what: "Expected '}' but found the end of the input",
      where: 7,
      why: BRACE_CLOSE_WHY,
      fix: BRACE_CLOSE_FIX,
    },
  });
});

test('interpretTuff("{ 2 + 3 )") => error', () => {
  expect(interpretTuff("{ 2 + 3 )")).toEqual({
    ok: false,
    error: {
      what: "Expected '}' to close '{' but found ')'",
      where: 8,
      why: MISMATCH_WHY,
      fix: "Replace this character with '}', or change the opening bracket.",
    },
  });
});

test('interpretTuff("(1 2)") => error', () => {
  expect(interpretTuff("(1 2)")).toEqual({
    ok: false,
    error: {
      what: "Expected '+', '-', '*', ')', or '}' but found '2'",
      where: 3,
      why: GROUPED_OPERATOR_WHY,
      fix: GROUPED_OPERATOR_FIX,
    },
  });
});

test('interpretTuff("1 + 2)") => error', () => {
  expect(interpretTuff("1 + 2)")).toEqual({
    ok: false,
    error: {
      what: "Expected '+', '-', or '*' but found ')'",
      where: 5,
      why: OPERATOR_WHY,
      fix: OPERATOR_FIX,
    },
  });
});

test('interpretTuff("(1 + )") => error', () => {
  expect(interpretTuff("(1 + )")).toEqual({
    ok: false,
    error: {
      what: "Expected a number, a variable, '(', or '{' but found ')'",
      where: 5,
      why: NUMBER_WHY,
      fix: NUMBER_FIX,
    },
  });
});

test('interpretTuff("1 +") => error', () => {
  expect(interpretTuff("1 +")).toEqual({
    ok: false,
    error: {
      what: "Expected a number, a variable, '(', or '{' but found the end of the input",
      where: 3,
      why: NUMBER_WHY,
      fix: NUMBER_FIX,
    },
  });
});

test('interpretTuff("()") => error', () => {
  expect(interpretTuff("()")).toEqual({
    ok: false,
    error: {
      what: "Expected a number, a variable, '(', or '{' but found ')'",
      where: 1,
      why: NUMBER_WHY,
      fix: NUMBER_FIX,
    },
  });
});

test('interpretTuff("1 - -2") => 3', () => {
  expect(interpretTuff("1 - -2")).toEqual({ ok: true, value: 3 });
});
