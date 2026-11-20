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
const EQUALS_WHY = "A 'let' statement gives its variable a value with '='.";
const EQUALS_FIX = "Insert '=' between the name and its value.";
const NAME_WHY =
  "A 'let' statement names the variable it declares, as in 'let x = 1;'.";
const NAME_FIX = "Write a name made of letters after 'let'.";
const KEYWORD_WHY =
  "'let' starts a declaration, so it cannot also name a variable.";
const KEYWORD_FIX = "Choose a different name.";
const SEMICOLON_WHY = "Every 'let' statement must end with ';'.";
const SEMICOLON_FIX = "Add ';' after the value.";
const STRAY_SEMICOLON_WHY = "';' only ends a 'let' statement.";
const STRAY_SEMICOLON_FIX =
  "Remove the ';', or start the statement with 'let name ='.";
const LET_POSITION_WHY =
  "A 'let' statement can only begin the program, a block, or follow a ';', so it cannot be part of a larger expression.";
const LET_POSITION_FIX =
  "Move the 'let' statement out of the parentheses or operator, or remove the 'let'.";

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

test('interpretTuff("let x = 1; x y") => error', () => {
  expect(interpretTuff("let x = 1; x y")).toEqual({
    ok: false,
    error: {
      what: "Expected '+', '-', or '*' but found 'y'",
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

test('interpretTuff("let mut x = 0; let y = { x = 1; x }; x") => 1', () => {
  expect(interpretTuff("let mut x = 0; let y = { x = 1; x }; x")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("1 - -2") => 3', () => {
  expect(interpretTuff("1 - -2")).toEqual({ ok: true, value: 3 });
});
