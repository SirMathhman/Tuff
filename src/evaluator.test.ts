import { evalProgram } from "./evaluator.js";
import { parse } from "./parser.js";
import { tokenize } from "./lexer.js";
import type { EvalError, Result } from "./errors.js";

/** Tokenize, parse, and evaluate a source program in one step. */
function evalSource(source: string): Result<number, EvalError> {
  const tokens = tokenize(source);
  if (!tokens.ok) {
    return tokens;
  }
  const program = parse(tokens.value, source);
  if (!program.ok) {
    return program;
  }
  return evalProgram(program.value);
}

test("evalProgram returns the value of a return statement", () => {
  expect(evalSource("return 1;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram coerces a bool return to a number", () => {
  expect(evalSource("return true;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return false;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram compares with a type-strict ==", () => {
  expect(evalSource("return 1 == 1;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 1 == 2;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return true == true;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return true == false;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return true == 1;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return false == 0;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram compares with <", () => {
  expect(evalSource("let x = 0; let y = 1; return x < y;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("let x = 1; let y = 0; return x < y;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return 1 < 1;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram compares with <=, >, and >=", () => {
  expect(evalSource("return 1 <= 1;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 2 <= 1;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return 1 > 0;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 1 > 1;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return 1 >= 1;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 0 >= 1;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram compares with a type-strict !=", () => {
  expect(evalSource("return 1 != 2;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 1 != 1;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return true != false;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return true != true;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return true != 1;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram chains == left-associatively", () => {
  expect(evalSource("return 1 == 1 == 1;")).toEqual({ ok: true, value: 1 });
  // (2 == 3) == 0 -> 0 == 0 -> 1 (a right-associative parse would give 0)
  expect(evalSource("return 2 == 3 == 0;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram shadows a variable in an inner block and restores it after", () => {
  expect(evalSource("let x = 1; { let x = 2; } return x;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram keeps an inner-block assignment to a shadowed variable local", () => {
  expect(evalSource("let mut x = 1; { let mut x = 2; x = 3; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test("evalProgram allows a block without a return", () => {
  expect(evalSource("{ let x = 1; } return 2;")).toEqual({ ok: true, value: 2 });
});

test("evalProgram short-circuits statements after a return", () => {
  expect(evalSource("return 1; let x = 2;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram returns a MissingReturn error when no return statement is present", () => {
  expect(evalSource("let x = 1;")).toEqual({ ok: false, error: { kind: "MissingReturn" } });
});

test("evalProgram returns an ImmutableAssignment error with the variable name and position", () => {
  expect(evalSource("let x = 0; x = 1; return x;")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "x", position: 11 },
  });
});

test("evalProgram returns an UnknownIdentifier error with the variable name and position", () => {
  expect(evalSource("return y;")).toEqual({
    ok: false,
    error: { kind: "UnknownIdentifier", name: "y", position: 7 },
  });
});
