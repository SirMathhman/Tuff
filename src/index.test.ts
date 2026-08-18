import { evaluate, type EvaluateError } from "./index.js";

function expectError(input: string, error: EvaluateError): void {
  expect(evaluate(input)).toEqual({ ok: false, error });
}

test("returns 0 for an empty string", () => {
  expect(evaluate("")).toEqual({ ok: true, value: 0 });
});

test('returns 1 for the input "1"', () => {
  expect(evaluate("1")).toEqual({ ok: true, value: 1 });
});

test('returns 1 for the input "true"', () => {
  expect(evaluate("true")).toEqual({ ok: true, value: 1 });
});

test('returns 0 for the input "false"', () => {
  expect(evaluate("false")).toEqual({ ok: true, value: 0 });
});

test("returns 1 for a boolean binding read back", () => {
  expect(evaluate("let x = true; x")).toEqual({ ok: true, value: 1 });
});

test("returns 0 for a false binding read back", () => {
  expect(evaluate("let x = false; x")).toEqual({ ok: true, value: 0 });
});

test("returns 2 for adding two true literals", () => {
  expect(evaluate("true + true")).toEqual({ ok: true, value: 2 });
});

test("returns 0 for reassigning a mutable boolean binding", () => {
  expect(evaluate("let mut x = true; x = false; x")).toEqual({ ok: true, value: 0 });
});

test("returns 1 for a reference read through a boolean binding", () => {
  expect(evaluate("let x = true; let y = &x; *y")).toEqual({ ok: true, value: 1 });
});

test("returns a structured error for a binding named true", () => {
  expectError("let true = 1; true", {
    kind: "malformed-expression",
    input: "let true = 1; true",
    reason: 'Unexpected end of expression in "let true = 1; true"',
  });
});

test("returns a structured error for a binding named false", () => {
  expectError("let false = 0; false", {
    kind: "malformed-expression",
    input: "let false = 0; false",
    reason: 'Unexpected end of expression in "let false = 0; false"',
  });
});

test('returns 3 for the input "1 + 2"', () => {
  expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
});

test('returns 6 for the input "1 + 2 + 3"', () => {
  expect(evaluate("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
});

test('returns 1 for the input "2 + 3 - 4"', () => {
  expect(evaluate("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test('returns 10 for the input "2 * 3 + 4"', () => {
  expect(evaluate("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
});

test('returns 14 for the input "2 + 3 * 4"', () => {
  expect(evaluate("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
});

test('returns 24 for the input "2 * 3 * 4"', () => {
  expect(evaluate("2 * 3 * 4")).toEqual({ ok: true, value: 24 });
});

test("returns the parsed number for valid numeric input", () => {
  expect(evaluate("42")).toEqual({ ok: true, value: 42 });
});

test('returns 20 for the input "(2 + 3) * 4"', () => {
  expect(evaluate("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
});

test('returns 20 for the input "{ 2 + 3 } * 4"', () => {
  expect(evaluate("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test('returns 20 for the input "{ let x = 2 + 3; x } * 4"', () => {
  expect(evaluate("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
});

test('returns 20 for the input "let y = { let x = 2 + 3; x } * 4; y"', () => {
  expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toEqual({ ok: true, value: 20 });
});

test("returns 3 for multiple top-level let statements", () => {
  expect(evaluate("let a = 1; let b = a + 1; a + b")).toEqual({ ok: true, value: 3 });
});

test('returns 1 for the input "let mut x = 0; x = 1; x"', () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toEqual({ ok: true, value: 1 });
});

test("returns 5 for repeated assignments to a mutable variable", () => {
  expect(evaluate("let mut x = 1; x = 2; x = x + 3; x")).toEqual({ ok: true, value: 5 });
});

test("returns 2 for a mutable variable assigned inside a block", () => {
  expect(evaluate("let mut x = 1; { x = 2; x }")).toEqual({ ok: true, value: 2 });
});

test("returns 3 for a let mut statement inside a block", () => {
  expect(evaluate("{ let mut x = 1; x = 2; x + 1 }")).toEqual({ ok: true, value: 3 });
});

test("returns 2 for multiple let statements in a block", () => {
  expect(evaluate("{ let a = 1; let b = a + 1; a * b }")).toEqual({ ok: true, value: 2 });
});

test("returns 2 for a shadowed variable in a nested block", () => {
  expect(evaluate("{ let x = 1; { let x = 2; x } }")).toEqual({ ok: true, value: 2 });
});

test("returns 1 for a variable read from an outer block", () => {
  expect(evaluate("{ let x = 1; { x } }")).toEqual({ ok: true, value: 1 });
});

test("returns a structured error for an unknown variable", () => {
  expectError("x", {
    kind: "unknown-variable",
    input: "x",
    name: "x",
    reason: 'Unknown variable "x" in "x"',
  });
});

test("returns a structured error for a variable used outside its block", () => {
  expectError("{ let x = 1; x } + x", {
    kind: "unknown-variable",
    input: "{ let x = 1; x } + x",
    name: "x",
    reason: 'Unknown variable "x" in "{ let x = 1; x } + x"',
  });
});

test("returns a structured error for an unknown variable after *", () => {
  expectError("2 * abc", {
    kind: "unknown-variable",
    input: "2 * abc",
    name: "abc",
    reason: 'Unknown variable "abc" in "2 * abc"',
  });
});

test("returns a structured error for an unknown variable with a multi-character name", () => {
  expectError("abc", {
    kind: "unknown-variable",
    input: "abc",
    name: "abc",
    reason: 'Unknown variable "abc" in "abc"',
  });
});

test("returns a structured error for an assignment to an unknown variable", () => {
  expectError("y = 1; y", {
    kind: "unknown-variable",
    input: "y = 1; y",
    name: "y",
    reason: 'Unknown variable "y" in "y = 1; y"',
  });
});

test("returns a structured error for an assignment to an immutable variable", () => {
  expectError("let x = 0; x = 1; x", {
    kind: "immutable-assignment",
    input: "let x = 0; x = 1; x",
    name: "x",
    reason: 'Cannot assign to immutable variable "x" in "let x = 0; x = 1; x"',
  });
});

test("returns a structured error for an assignment to an immutable variable from a block", () => {
  expectError("let x = 0; { x = 1; x }", {
    kind: "immutable-assignment",
    input: "let x = 0; { x = 1; x }",
    name: "x",
    reason: 'Cannot assign to immutable variable "x" in "let x = 0; { x = 1; x }"',
  });
});

test("returns a structured error for a top-level let statement missing =", () => {
  expectError("let x 1; x", {
    kind: "malformed-expression",
    input: "let x 1; x",
    reason: 'Unexpected end of expression in "let x 1; x"',
  });
});

test("returns a structured error for a top-level let statement missing ;", () => {
  expectError("let x = 1 x", {
    kind: "malformed-expression",
    input: "let x = 1 x",
    reason: 'Unexpected end of expression in "let x = 1 x"',
  });
});

test("returns a structured error for a dangling top-level let", () => {
  expectError("let", {
    kind: "malformed-expression",
    input: "let",
    reason: 'Unexpected end of expression in "let"',
  });
});

// Coverage: statements end with no final expression (parseStatements end branch).
test("returns a structured error for statements with no final expression", () => {
  expectError("let x = 1;", {
    kind: "malformed-expression",
    input: "let x = 1;",
    reason: 'Unexpected end of expression in "let x = 1;"',
  });
});

// Coverage: assignment statement with no value (parseAssignmentStatement null branch).
test("returns a structured error for an assignment statement with no value", () => {
  expectError("let mut x = 0; x = ; x", {
    kind: "malformed-expression",
    input: "let mut x = 0; x = ; x",
    reason: 'Unexpected end of expression in "let mut x = 0; x = ; x"',
  });
});

// Coverage: assignment statement missing ; (parseAssignmentStatement semicolon branch).
test("returns a structured error for an assignment statement missing ;", () => {
  expectError("let mut x = 0; x = 1 x", {
    kind: "malformed-expression",
    input: "let mut x = 0; x = 1 x",
    reason: 'Unexpected end of expression in "let mut x = 0; x = 1 x"',
  });
});

test("returns a structured error for a let statement missing =", () => {
  expectError("{ let x 1; x }", {
    kind: "malformed-expression",
    input: "{ let x 1; x }",
    reason: 'Unexpected end of expression in "{ let x 1; x }"',
  });
});

test("returns a structured error for a let statement missing ;", () => {
  expectError("{ let x = 1 x }", {
    kind: "malformed-expression",
    input: "{ let x = 1 x }",
    reason: 'Unexpected end of expression in "{ let x = 1 x }"',
  });
});

test("returns a structured error for an unclosed block", () => {
  expectError("{ let x = 1; x", {
    kind: "malformed-expression",
    input: "{ let x = 1; x",
    reason: 'Unexpected end of expression in "{ let x = 1; x"',
  });
});

test("returns a structured error for a let statement with no name", () => {
  expectError("{ let }", {
    kind: "malformed-expression",
    input: "{ let }",
    reason: 'Unexpected end of expression in "{ let }"',
  });
});

test("returns a structured error for a dangling let", () => {
  expectError("{ let", {
    kind: "malformed-expression",
    input: "{ let",
    reason: 'Unexpected end of expression in "{ let"',
  });
});

test("returns a structured error for a let statement with no value", () => {
  expectError("{ let x = ; }", {
    kind: "malformed-expression",
    input: "{ let x = ; }",
    reason: 'Unexpected end of expression in "{ let x = ; }"',
  });
});

test("returns a structured error for a malformed expression", () => {
  expectError("1 +", {
    kind: "malformed-expression",
    input: "1 +",
    reason: 'Unexpected end of expression in "1 +"',
  });
});

test("returns a structured error for a missing operand", () => {
  expectError("1 + + 2", {
    kind: "malformed-expression",
    input: "1 + + 2",
    reason: 'Unexpected end of expression in "1 + + 2"',
  });
});

test("returns a structured error for a missing operand after *", () => {
  expectError("2 * ", {
    kind: "malformed-expression",
    input: "2 * ",
    reason: 'Unexpected end of expression in "2 * "',
  });
});

// Coverage: identifier between two numbers (tokenize gap branch).
test("returns a structured error for an identifier between numbers", () => {
  expectError("1 a 2", {
    kind: "malformed-expression",
    input: "1 a 2",
    reason: 'Unexpected end of expression in "1 a 2"',
  });
});

// Coverage: unrecognized character between tokens (tokenize gap branch).
test("returns a structured error for an unrecognized character between tokens", () => {
  expectError("1 @ 2", {
    kind: "invalid-number",
    input: "1 @ 2",
    reason: 'Cannot parse "1 @ 2" as a number',
  });
});

// Coverage: unrecognized trailing character (tokenize tail branch).
test("returns a structured error for an unrecognized trailing character", () => {
  expectError("1 + @", {
    kind: "invalid-number",
    input: "1 + @",
    reason: 'Cannot parse "1 + @" as a number',
  });
});

// Coverage: unclosed parenthesis (parser paren branch).
test("returns a structured error for an unclosed parenthesis", () => {
  expectError("(1 +", {
    kind: "malformed-expression",
    input: "(1 +",
    reason: 'Unexpected end of expression in "(1 +"',
  });
});
