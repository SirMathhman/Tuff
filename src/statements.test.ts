import { expect, test } from "bun:test";
import { interpretTuff } from "./index";
import {
  OPERATOR_WHY,
  OPERATOR_FIX,
  UNDEFINED_WHY,
  EQUALS_WHY,
  EQUALS_FIX,
  NAME_WHY,
  NAME_FIX,
  KEYWORD_WHY,
  KEYWORD_FIX,
  SEMICOLON_WHY,
  SEMICOLON_FIX,
  STRAY_SEMICOLON_WHY,
  STRAY_SEMICOLON_FIX,
  LET_POSITION_WHY,
  LET_POSITION_FIX,
} from "./test-messages";

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
      what: "A block must end with an expression, not a statement",
      where: 13,
      why: "The value of a block is its final expression, so a block that ends with a statement has no value.",
      fix: "Add an expression after the last statement, such as the variable's name.",
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

test('interpretTuff("let x = 1; let x = 2; x") => 2', () => {
  expect(interpretTuff("let x = 1; let x = 2; x")).toEqual({
    ok: true,
    value: 2,
  });
});

test('interpretTuff("let x = 5; { let x = 2; x } + x") => 7', () => {
  expect(interpretTuff("let x = 5; { let x = 2; x } + x")).toEqual({
    ok: true,
    value: 7,
  });
});

test('interpretTuff("{ let x = 1; { x } }") => 1', () => {
  expect(interpretTuff("{ let x = 1; { x } }")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("{ let x = 1; 2 } + x") => error', () => {
  expect(interpretTuff("{ let x = 1; 2 } + x")).toEqual({
    ok: false,
    error: {
      what: "Name 'x' is not defined",
      where: 19,
      why: UNDEFINED_WHY,
      fix: "Declare it with 'let x = ...;' before using it, in this block or an enclosing one.",
    },
  });
});

test('interpretTuff("let x 1;") => error', () => {
  expect(interpretTuff("let x 1;")).toEqual({
    ok: false,
    error: {
      what: "Expected '=' after 'let x' but found '1'",
      where: 6,
      why: EQUALS_WHY,
      fix: EQUALS_FIX,
    },
  });
});

test('interpretTuff("let = 1;") => error', () => {
  expect(interpretTuff("let = 1;")).toEqual({
    ok: false,
    error: {
      what: "Expected a variable name after 'let' but found '='",
      where: 4,
      why: NAME_WHY,
      fix: NAME_FIX,
    },
  });
});

test('interpretTuff("let let = 1;") => error', () => {
  expect(interpretTuff("let let = 1;")).toEqual({
    ok: false,
    error: {
      what: "'let' is a keyword and cannot be a variable name",
      where: 4,
      why: KEYWORD_WHY,
      fix: KEYWORD_FIX,
    },
  });
});

test('interpretTuff("let x = 1") => error', () => {
  expect(interpretTuff("let x = 1")).toEqual({
    ok: false,
    error: {
      what: "Expected ';' but found the end of the input",
      where: 9,
      why: SEMICOLON_WHY,
      fix: SEMICOLON_FIX,
    },
  });
});

test('interpretTuff("let x = 1; x y") => error', () => {
  expect(interpretTuff("let x = 1; x y")).toEqual({
    ok: false,
    error: {
      what: "Expected '+', '-', '*', '<', '>', '<=', '>=', '==', or '!=' but found 'y'",
      where: 13,
      why: OPERATOR_WHY,
      fix: OPERATOR_FIX,
    },
  });
});

test('interpretTuff("let x = 1 y") => error', () => {
  expect(interpretTuff("let x = 1 y")).toEqual({
    ok: false,
    error: {
      what: "Expected ';' but found 'y'",
      where: 10,
      why: SEMICOLON_WHY,
      fix: SEMICOLON_FIX,
    },
  });
});

test('interpretTuff("let x = 1; ;") => error', () => {
  expect(interpretTuff("let x = 1; ;")).toEqual({
    ok: false,
    error: {
      what: "Unexpected ';' outside a let statement",
      where: 11,
      why: STRAY_SEMICOLON_WHY,
      fix: STRAY_SEMICOLON_FIX,
    },
  });
});

test('interpretTuff("(let x = 1; x)") => error', () => {
  expect(interpretTuff("(let x = 1; x)")).toEqual({
    ok: false,
    error: {
      what: "'let' is only allowed at the start of a statement",
      where: 1,
      why: LET_POSITION_WHY,
      fix: LET_POSITION_FIX,
    },
  });
});

test('interpretTuff("let mut x = 0; x = 1; x") => 1', () => {
  expect(interpretTuff("let mut x = 0; x = 1; x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("let x = 0; x = 1; x") => error', () => {
  expect(interpretTuff("let x = 0; x = 1; x")).toEqual({
    ok: false,
    error: {
      what: "Cannot assign to 'x' because it was not declared with 'let mut'",
      where: 11,
      why: "Only variables declared with 'let mut' can be reassigned.",
      fix: "Declare 'x' with 'let mut x = ...;' to allow reassignment.",
    },
  });
});

test('interpretTuff("let mut x = 0; let y = { x = 1; x }; x") => 1', () => {
  expect(interpretTuff("let mut x = 0; let y = { x = 1; x }; x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("{ let x = 1; { 2 } }") => 2', () => {
  expect(interpretTuff("{ let x = 1; { 2 } }")).toEqual({ ok: true, value: 2 });
});

test('interpretTuff("let mut x = 1; { let mut x = 5; x = 2; x } + x") => 3', () => {
  expect(
    interpretTuff("let mut x = 1; { let mut x = 5; x = 2; x } + x"),
  ).toEqual({
    ok: true,
    value: 3,
  });
});

test('interpretTuff("let mut x = 1; { let x = 5; x = 2; } x") => error', () => {
  expect(interpretTuff("let mut x = 1; { let x = 5; x = 2; } x")).toEqual({
    ok: false,
    error: {
      what: "Cannot assign to 'x' because it was not declared with 'let mut'",
      where: 28,
      why: "Only variables declared with 'let mut' can be reassigned.",
      fix: "Declare 'x' with 'let mut x = ...;' to allow reassignment.",
    },
  });
});

test('interpretTuff("let x = true; x") => 1', () => {
  expect(interpretTuff("let x = true; x")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("true + 1") => error', () => {
  expect(interpretTuff("true + 1")).toEqual({
    ok: false,
    error: {
      what: "Cannot use a boolean with '+'",
      where: 5,
      why: "Only numbers can be used with arithmetic or comparison operators; a boolean has no numeric value.",
      fix: "Use a number in place of the boolean, or remove the operator.",
    },
  });
});

test('interpretTuff("let x = 3 < 5; x") => 1', () => {
  expect(interpretTuff("let x = 3 < 5; x")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("-true") => error', () => {
  expect(interpretTuff("-true")).toEqual({
    ok: false,
    error: {
      what: "Cannot apply a sign to a boolean",
      where: 1,
      why: "A sign can only change the value of a number.",
      fix: "Remove the sign, or use a number.",
    },
  });
});

test('interpretTuff("let true = 1;") => error', () => {
  expect(interpretTuff("let true = 1;")).toEqual({
    ok: false,
    error: {
      what: "'true' is a keyword and cannot be a variable name",
      where: 4,
      why: "'true' has a fixed meaning, so it cannot also name a variable.",
      fix: "Choose a different name.",
    },
  });
});

test('interpretTuff("false") => 0', () => {
  expect(interpretTuff("false")).toEqual({ ok: true, value: 0 });
});

test('interpretTuff("true * false") => error', () => {
  expect(interpretTuff("true * false")).toEqual({
    ok: false,
    error: {
      what: "Cannot use a boolean with '*'",
      where: 5,
      why: "Only numbers can be used with arithmetic or comparison operators; a boolean has no numeric value.",
      fix: "Use a number in place of the boolean, or remove the operator.",
    },
  });
});

test('interpretTuff("{ let b = true; b } + 1") => error', () => {
  expect(interpretTuff("{ let b = true; b } + 1")).toEqual({
    ok: false,
    error: {
      what: "Cannot use a boolean with '+'",
      where: 20,
      why: "Only numbers can be used with arithmetic or comparison operators; a boolean has no numeric value.",
      fix: "Use a number in place of the boolean, or remove the operator.",
    },
  });
});

test('interpretTuff("let mut x = 0; x = true; x") => error', () => {
  expect(interpretTuff("let mut x = 0; x = true; x")).toEqual({
    ok: false,
    error: {
      what: "Cannot assign a boolean to 'x', which holds a number",
      where: 15,
      why: "A variable keeps the type of the value it holds.",
      fix: "Assign a value of the same type, or declare a new variable.",
    },
  });
});

test('interpretTuff("true == true") => error', () => {
  expect(interpretTuff("true == true")).toEqual({
    ok: false,
    error: {
      what: "Cannot use a boolean with '=='",
      where: 5,
      why: "Only numbers can be used with arithmetic or comparison operators; a boolean has no numeric value.",
      fix: "Use a number in place of the boolean, or remove the operator.",
    },
  });
});
