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
