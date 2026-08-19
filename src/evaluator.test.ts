import { evalProgram } from "./evaluator.js";
import { parse } from "./parser/index.js";
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

test("evalProgram adds with a compound += assignment", () => {
  expect(evalSource("let mut x = 1; x += 2; return x;")).toEqual({ ok: true, value: 3 });
});

test("evalProgram returns an ImmutableAssignment error for += on a non-mut variable", () => {
  expect(evalSource("let x = 1; x += 2; return x;")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "x", position: 11 },
  });
});

test("evalProgram returns a TypeMismatch error when assigning a bool to a number variable", () => {
  expect(evalSource("let mut x = 0; x = true; return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "number", actual: "bool", position: 15 },
  });
});

test("evalProgram returns a TypeMismatch error when assigning a number to a bool variable", () => {
  expect(evalSource("let mut x = true; x = 0; return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "bool", actual: "number", position: 18 },
  });
});

test("evalProgram allows assigning a value of the same type", () => {
  expect(evalSource("let mut x = 0; x = 1; return x;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("let mut x = true; x = false; return x;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram returns a TypeMismatch error for += on a bool variable", () => {
  expect(evalSource("let mut x = true; x += 1; return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "number", actual: "bool", position: 18 },
  });
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

test("evalProgram runs the else branch when the if condition is false", () => {
  expect(evalSource("let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;")).toEqual({
    ok: true,
    value: 2,
  });
});

test("evalProgram runs the then branch when the if condition is true", () => {
  expect(evalSource("let mut x = 0; if (true) { x = 1; } else { x = 2; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test("evalProgram skips an if without else when the condition is false", () => {
  expect(evalSource("let mut x = 0; if (false) { x = 1; } return x;")).toEqual({
    ok: true,
    value: 0,
  });
});

test("evalProgram scopes if branches like blocks", () => {
  expect(evalSource("let x = 1; if (true) { let x = 2; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
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

test("evalProgram loops with a while statement", () => {
  expect(evalSource("let mut x = 0; while (x < 4) { x += 1; } return x;")).toEqual({
    ok: true,
    value: 4,
  });
});

test("evalProgram skips a while body when the condition is false", () => {
  expect(evalSource("let mut x = 0; while (false) { x = 1; } return x;")).toEqual({
    ok: true,
    value: 0,
  });
});

test("evalProgram scopes while bodies like blocks", () => {
  expect(evalSource("let x = 1; while (false) { let x = 2; } return x;")).toEqual({
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
