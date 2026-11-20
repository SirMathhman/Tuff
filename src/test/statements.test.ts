import { expect, test } from "bun:test";
import { interpretTuff } from "../index";
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
      what: "Expected '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=' but found 'y'",
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

test('interpretTuff("let x = if (true) 2 else 3; x") => 2', () => {
  expect(interpretTuff("let x = if (true) 2 else 3; x")).toEqual({
    ok: true,
    value: 2,
  });
});

test('interpretTuff("if (1) 2 else 3") => error', () => {
  expect(interpretTuff("if (1) 2 else 3")).toEqual({
    ok: false,
    error: {
      what: "The condition of 'if' must be a boolean",
      where: 5,
      why: "Only a boolean can choose a branch; a number has no truth value.",
      fix: "Use a comparison such as 'x < 5', or a boolean value.",
    },
  });
});

test('interpretTuff("if (true) 2") => error', () => {
  expect(interpretTuff("if (true) 2")).toEqual({
    ok: false,
    error: {
      what: "Expected 'else' but found the end of the input",
      where: 11,
      why: "An 'if' expression needs an 'else' branch so that it always has a value.",
      fix: "Add 'else' followed by a value.",
    },
  });
});

test('interpretTuff("if (true) 1 else { true + true }") => error', () => {
  expect(interpretTuff("if (true) 1 else { true + true }")).toEqual({
    ok: false,
    error: {
      what: "Cannot use a boolean with '+'",
      where: 24,
      why: "Only numbers can be used with arithmetic or comparison operators; a boolean has no numeric value.",
      fix: "Use a number in place of the boolean, or remove the operator.",
    },
  });
});

test('interpretTuff("if (true) 1 else { - true }") => error', () => {
  expect(interpretTuff("if (true) 1 else { - true }")).toEqual({
    ok: false,
    error: {
      what: "Expected a number, a variable, '(', or '{' but found whitespace",
      where: 20,
      why: "Every '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=' must be followed by an integer, a variable, or a parenthesized or braced expression, and an expression must start with one.",
      fix: "Put an integer, a variable, '(' or '{' at this position, or remove the operator before it.",
    },
  });
});

test('interpretTuff("if (true) 1 else { -true }") => error', () => {
  expect(interpretTuff("if (true) 1 else { -true }")).toEqual({
    ok: false,
    error: {
      what: "Cannot apply a sign to a boolean",
      where: 20,
      why: "A sign can only change the value of a number.",
      fix: "Remove the sign, or use a number.",
    },
  });
});

test('interpretTuff("if (true) 2 else (true + 1)") => error', () => {
  expect(interpretTuff("if (true) 2 else (true + 1)")).toEqual({
    ok: false,
    error: {
      what: "Cannot use a boolean with '+'",
      where: 23,
      why: "Only numbers can be used with arithmetic or comparison operators; a boolean has no numeric value.",
      fix: "Use a number in place of the boolean, or remove the operator.",
    },
  });
});

test('interpretTuff("1 + { let x = 2; }") => error', () => {
  expect(interpretTuff("1 + { let x = 2; }")).toEqual({
    ok: false,
    error: {
      what: "A block must end with an expression, not a statement",
      where: 17,
      why: "The value of a block is its final expression, so a block that ends with a statement has no value.",
      fix: "Add an expression after the last statement, such as the variable's name.",
    },
  });
});

test('interpretTuff("1 / { let x = 0; x }") => error', () => {
  expect(interpretTuff("1 / { let x = 0; x }")).toEqual({
    ok: false,
    error: {
      what: "Division by zero",
      where: 2,
      why: "A number cannot be divided by zero.",
      fix: "Use a non-zero divisor.",
    },
  });
});

test('interpretTuff("if (false) { 1 / { let x = 0; x }} else 1") => error', () => {
  expect(interpretTuff("if (false) { 1 / { let x = 0; x }} else 1")).toEqual({
    ok: false,
    error: {
      what: "Division by zero",
      where: 15,
      why: "A number cannot be divided by zero.",
      fix: "Use a non-zero divisor.",
    },
  });
});

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

test('interpretTuff("if (true) 1 { 1 / { let x = 0; x }}") => error', () => {
  expect(interpretTuff("if (true) 1 { 1 / { let x = 0; x }}")).toEqual({
    ok: false,
    error: {
      what: "Expected 'else' but found '{'",
      where: 12,
      why: "An 'if' expression needs an 'else' branch so that it always has a value.",
      fix: "Add 'else' followed by a value.",
    },
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

test('interpretTuff("if (false) { 2 } else { 3 }") => 3', () => {
  expect(interpretTuff("if (false) { 2 } else { 3 }")).toEqual({
    ok: true,
    value: 3,
  });
});

test('interpretTuff("if (false) { let x = 0; x = 1; x } else { 3 }") => error', () => {
  expect(
    interpretTuff("if (false) { let x = 0; x = 1; x } else { 3 }"),
  ).toEqual({
    ok: false,
    error: {
      what: "Cannot assign to 'x' because it was not declared with 'let mut'",
      where: 24,
      why: "Only variables declared with 'let mut' can be reassigned.",
      fix: "Declare 'x' with 'let mut x = ...;' to allow reassignment.",
    },
  });
});
