import { expect, test } from "bun:test";
import { interpretTuff } from "../index";
import {
  NUMBER_WHY,
  NUMBER_FIX,
  OPERATOR_WHY,
  OPERATOR_FIX,
  GROUPED_OPERATOR_WHY,
  GROUPED_OPERATOR_FIX,
  UNDEFINED_WHY,
  MISMATCH_WHY,
  MISMATCH_FIX,
  PAREN_CLOSE_WHY,
  PAREN_CLOSE_FIX,
  BRACE_CLOSE_WHY,
  BRACE_CLOSE_FIX,
  STRAY_SEMICOLON_WHY,
  STRAY_SEMICOLON_FIX,
} from "./test-messages";

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
      what: "Expected '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=' but found 'x'",
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
      what: "Expected '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=' but found '.'",
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
      what: "Expected '+', '-', '*', '/', '<', '>', '<=', '>=', '==', '!=', ')', or '}' but found '2'",
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
      what: "Expected '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=' but found ')'",
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

test('interpretTuff("1;") => error', () => {
  expect(interpretTuff("1;")).toEqual({
    ok: false,
    error: {
      what: "Unexpected ';' outside a let statement",
      where: 1,
      why: STRAY_SEMICOLON_WHY,
      fix: STRAY_SEMICOLON_FIX,
    },
  });
});

test('interpretTuff("y = 1;") => error', () => {
  expect(interpretTuff("y = 1;")).toEqual({
    ok: false,
    error: {
      what: "Name 'y' is not defined",
      where: 0,
      why: UNDEFINED_WHY,
      fix: "Declare it with 'let y = ...;' before using it, in this block or an enclosing one.",
    },
  });
});

test('interpretTuff("1 < 2 < 3") => error', () => {
  expect(interpretTuff("1 < 2 < 3")).toEqual({
    ok: false,
    error: {
      what: "Comparisons cannot be chained",
      where: 6,
      why: "A comparison produces a boolean, which cannot be compared again in the same expression.",
      fix: "Remove one of the comparisons, or compare the values in separate statements.",
    },
  });
});

test('interpretTuff("2 * 3 < 7") => 1', () => {
  expect(interpretTuff("2 * 3 < 7")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("1 + 2 == 3") => 1', () => {
  expect(interpretTuff("1 + 2 == 3")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("each comparison operator") => 1, 1, 1, 0, 1, 0', () => {
  expect(interpretTuff("2 < 3")).toEqual({ ok: true, value: 1 });
  expect(interpretTuff("2 <= 2")).toEqual({ ok: true, value: 1 });
  expect(interpretTuff("4 > 3")).toEqual({ ok: true, value: 1 });
  expect(interpretTuff("3 >= 4")).toEqual({ ok: true, value: 0 });
  expect(interpretTuff("3 != 4")).toEqual({ ok: true, value: 1 });
  expect(interpretTuff("3 == 4")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("1 - -2") => 3', () => {
  expect(interpretTuff("1 - -2")).toEqual({ ok: true, value: 3 });
});

test('interpretTuff("1 / 0") => error', () => {
  expect(interpretTuff("1 / 0")).toEqual({
    ok: false,
    error: {
      what: "Division by zero",
      where: 2,
      why: "A number cannot be divided by zero.",
      fix: "Use a non-zero divisor.",
    },
  });
});

test('interpretTuff("7 / 2") => 3', () => {
  expect(interpretTuff("7 / 2")).toEqual({ ok: true, value: 3 });
});

test('interpretTuff("let mut x = 0; { x = 1; } x") => 1', () => {
  expect(interpretTuff("let mut x = 0; { x = 1; } x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let mut x = 0; if (true) { x = 1; } x") => 1', () => {
  expect(interpretTuff("let mut x = 0; if (true) { x = 1; } x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let mut x = 1; x += 2; x") => 3', () => {
  expect(interpretTuff("let mut x = 1; x += 2; x")).toEqual({
    ok: true,
    value: 3,
  });
});

test('interpretTuff("fn get() => 1; get()") => 1', () => {
  expect(interpretTuff("fn get() => 1; get()")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("fn get() => 1;") => 0', () => {
  expect(interpretTuff("fn get() => 1;")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("fn get() => { 1 } get()") => 1', () => {
  expect(interpretTuff("fn get() => { 1 } get()")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("fn get() => { let mut x = 0; x = true; x }") => error', () => {
  expect(interpretTuff("fn get() => { let mut x = 0; x = true; x }")).toEqual({
    ok: false,
    error: {
      what: "Cannot assign a boolean to 'x', which holds a number",
      where: 29,
      why: "A variable keeps the type of the value it holds.",
      fix: "Assign a value of the same type, or declare a new variable.",
    },
  });
});

test('interpretTuff("let mut counter = 0; fn increment() => { counter += 1; } increment(); counter") => 1', () => {
  expect(
    interpretTuff(
      "let mut counter = 0; fn increment() => { counter += 1; } increment(); counter",
    ),
  ).toEqual({ ok: true, value: 1 });
});
