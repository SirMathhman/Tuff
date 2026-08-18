import { evaluate, type EvaluateError } from "./index.js";

function expectError(input: string, error: EvaluateError): void {
  expect(evaluate(input)).toEqual({ ok: false, error });
}

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
    kind: "reference-as-value",
    input: "let x = 1; let y = &x; y",
    name: "y",
    reason: 'Cannot use reference "y" as a value in "let x = 1; let y = &x; y"',
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
    kind: "reference-assignment",
    input: "let x = 1; let y = &x; y = 2; y",
    name: "y",
    reason: 'Cannot assign value to reference "y" in "let x = 1; let y = &x; y = 2; y"',
  });
});

test("returns a structured error for assigning a value to a reference binding", () => {
  expectError("let x = 0; let mut y = &x; y = x;", {
    kind: "reference-assignment",
    input: "let x = 0; let mut y = &x; y = x;",
    name: "y",
    reason: 'Cannot assign value to reference "y" in "let x = 0; let mut y = &x; y = x;"',
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
