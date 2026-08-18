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
test("returns 1 for a reference read through a shared reference", () => {
  expect(evaluate("let x = 1; let y = &x; *y")).toEqual({ ok: true, value: 1 });
});

test("returns 2 for a write through a mutable reference", () => {
  expect(evaluate("let mut x = 1; let y = &mut x; *y = 2; x")).toEqual({ ok: true, value: 2 });
});

test("returns 5 for a reference read after a write through another reference", () => {
  expect(evaluate("let mut x = 1; let a = &mut x; let b = &x; *a = 5; *b")).toEqual({
    ok: true,
    value: 5,
  });
});

test("returns a structured error for dereferencing a non-reference", () => {
  expectError("let x = 1; *x", {
    kind: "invalid-dereference",
    input: "let x = 1; *x",
    name: "x",
    reason: 'Cannot dereference non-reference "x" in "let x = 1; *x"',
  });
});

test("returns a structured error for a write through a shared reference", () => {
  expectError("let mut x = 1; let y = &x; *y = 2; x", {
    kind: "immutable-assignment",
    input: "let mut x = 1; let y = &x; *y = 2; x",
    name: "y",
    reason: 'Cannot assign to immutable variable "y" in "let mut x = 1; let y = &x; *y = 2; x"',
  });
});

test("returns a structured error for a mutable reference to an immutable binding", () => {
  expectError("let x = 1; let y = &mut x; *y", {
    kind: "immutable-assignment",
    input: "let x = 1; let y = &mut x; *y",
    name: "x",
    reason: 'Cannot assign to immutable variable "x" in "let x = 1; let y = &mut x; *y"',
  });
});

test("returns a structured error for reading a reference as a value", () => {
  expectError("let x = 1; let y = &x; y", {
    kind: "malformed-expression",
    input: "let x = 1; let y = &x; y",
    reason: 'Unexpected end of expression in "let x = 1; let y = &x; y"',
  });
});

test("returns a structured error for dereferencing an unknown variable", () => {
  expectError("*x", {
    kind: "unknown-variable",
    input: "*x",
    name: "x",
    reason: 'Unknown variable "x" in "*x"',
  });
});

test("returns a structured error for a write through a non-reference", () => {
  expectError("let x = 1; *x = 2; x", {
    kind: "invalid-dereference",
    input: "let x = 1; *x = 2; x",
    name: "x",
    reason: 'Cannot dereference non-reference "x" in "let x = 1; *x = 2; x"',
  });
});

test("returns a structured error for a write through an unknown reference", () => {
  expectError("*z = 1; z", {
    kind: "unknown-variable",
    input: "*z = 1; z",
    name: "z",
    reason: 'Unknown variable "z" in "*z = 1; z"',
  });
});

test("returns a structured error for a reference to an unknown variable", () => {
  expectError("let y = &z; y", {
    kind: "unknown-variable",
    input: "let y = &z; y",
    name: "z",
    reason: 'Unknown variable "z" in "let y = &z; y"',
  });
});

test("returns a structured error for a reference to a reference", () => {
  expectError("let x = 1; let y = &x; let z = &y; z", {
    kind: "malformed-expression",
    input: "let x = 1; let y = &x; let z = &y; z",
    reason: 'Unexpected end of expression in "let x = 1; let y = &x; let z = &y; z"',
  });
});

test("returns a structured error for an assignment to a reference variable", () => {
  expectError("let x = 1; let y = &x; y = 2; y", {
    kind: "malformed-expression",
    input: "let x = 1; let y = &x; y = 2; y",
    reason: 'Unexpected end of expression in "let x = 1; let y = &x; y = 2; y"',
  });
});

// Coverage: dangling dereference operator (parseDereference undefined branch).
test("returns a structured error for a dangling dereference operator", () => {
  expectError("*", {
    kind: "malformed-expression",
    input: "*",
    reason: 'Unexpected end of expression in "*"',
  });
});

// Coverage: non-identifier after dereference (parseDereference identifier branch).
test("returns a structured error for a non-identifier after a dereference", () => {
  expectError("*+", {
    kind: "malformed-expression",
    input: "*+",
    reason: 'Unexpected end of expression in "*+"',
  });
});

// Coverage: reference initializer with no name (parseReferenceBinding identifier branch).
test("returns a structured error for a reference initializer with no name", () => {
  expectError("let y = &;", {
    kind: "malformed-expression",
    input: "let y = &;",
    reason: 'Unexpected end of expression in "let y = &;"',
  });
});

// Coverage: dangling reference initializer (parseReferenceBinding undefined branch).
test("returns a structured error for a dangling reference initializer", () => {
  expectError("let y = &", {
    kind: "malformed-expression",
    input: "let y = &",
    reason: 'Unexpected end of expression in "let y = &"',
  });
});

// Coverage: reference initializer missing ; (parseLetStatement semicolon branch).
test("returns a structured error for a reference initializer missing ;", () => {
  expectError("let x = 1; let y = &x 1; y", {
    kind: "malformed-expression",
    input: "let x = 1; let y = &x 1; y",
    reason: 'Unexpected end of expression in "let x = 1; let y = &x 1; y"',
  });
});

// Coverage: dereference assignment with no value (parseDereferenceAssignment null branch).
test("returns a structured error for a dereference assignment with no value", () => {
  expectError("let mut x = 1; let y = &mut x; *y = ; x", {
    kind: "malformed-expression",
    input: "let mut x = 1; let y = &mut x; *y = ; x",
    reason: 'Unexpected end of expression in "let mut x = 1; let y = &mut x; *y = ; x"',
  });
});

// Coverage: dereference assignment missing ; (parseDereferenceAssignment semicolon branch).
test("returns a structured error for a dereference assignment missing ;", () => {
  expectError("let mut x = 1; let y = &mut x; *y = 2 x; x", {
    kind: "malformed-expression",
    input: "let mut x = 1; let y = &mut x; *y = 2 x; x",
    reason: 'Unexpected end of expression in "let mut x = 1; let y = &mut x; *y = 2 x; x"',
  });
});
