import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

const NUMBER_WHY =
  "Every '+', '-', or '*' must be followed by an integer or a parenthesized expression, and an expression must start with one.";
const NUMBER_FIX =
  "Put an integer or '(' at this position, or remove the operator before it.";
const OPERATOR_WHY =
  "Two numbers can only be combined with '+', '-', or '*'; any other character cannot follow a number.";
const OPERATOR_FIX =
  "Insert '+', '-', or '*' between the numbers, or remove the extra character.";

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
      what: "Expected a number or '(' but found 'x'",
      where: 4,
      why: NUMBER_WHY,
      fix: NUMBER_FIX,
    },
  });
});

test('interpretTuff("") => error', () => {
  expect(interpretTuff("")).toEqual({
    ok: false,
    error: {
      what: "Expected a number or '(' but found the end of the input",
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

test('interpretTuff("1 - -2") => 3', () => {
  expect(interpretTuff("1 - -2")).toEqual({ ok: true, value: 3 });
});
