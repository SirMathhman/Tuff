import { evaluate, type EvaluateError } from "./index.js";

function expectError(input: string, error: EvaluateError): void {
  expect(evaluate(input)).toEqual({ ok: false, error });
}

test("returns 0 for an empty string", () => {
  expect(evaluate("")).toEqual({ ok: true, value: 0 });
});

test("returns 0 for a binding with no trailing expression", () => {
  expect(evaluate("let x = 100;")).toEqual({ ok: true, value: 0 });
});

test("returns 0 for a binding and assignment with no trailing expression", () => {
  expect(evaluate("let mut x = 0; x = 1;")).toEqual({ ok: true, value: 0 });
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

test("returns 3 for a false if condition selecting the else branch", () => {
  expect(evaluate("let x = if (false) 2 else 3; x")).toEqual({ ok: true, value: 3 });
});

test("returns 2 for a true if condition selecting the then branch", () => {
  expect(evaluate("if (true) 2 else 3")).toEqual({ ok: true, value: 2 });
});

// Coverage: non-zero numeric condition selects the then branch.
test("returns 2 for a non-zero numeric if condition", () => {
  expect(evaluate("if (1) 2 else 3")).toEqual({ ok: true, value: 2 });
});

// Coverage: if expression used as a factor in a larger expression.
test("returns 6 for an if expression multiplied by 2", () => {
  expect(evaluate("if (false) 2 else 3 * 2")).toEqual({ ok: true, value: 6 });
});

// Coverage: if expression missing the condition parenthesis.
test("returns a structured error for an if expression missing (", () => {
  expectError("if true 2 else 3", {
    kind: "malformed-expression",
    input: "if true 2 else 3",
    reason: 'Unexpected end of expression in "if true 2 else 3"',
  });
});

// Coverage: if expression missing the else keyword.
test("returns a structured error for an if expression missing else", () => {
  expectError("if (true) 2 3", {
    kind: "malformed-expression",
    input: "if (true) 2 3",
    reason: 'Unexpected end of expression in "if (true) 2 3"',
  });
});

// Coverage: if expression condition not closed with ).
test("returns a structured error for an if expression with an unclosed condition", () => {
  expectError("if (true 2 else 3", {
    kind: "malformed-expression",
    input: "if (true 2 else 3",
    reason: 'Unexpected end of expression in "if (true 2 else 3"',
  });
});

// Coverage: if expression with an empty else branch.
test("returns a structured error for an if expression with an empty else branch", () => {
  expectError("if (true) 2 else", {
    kind: "malformed-expression",
    input: "if (true) 2 else",
    reason: 'Unexpected end of expression in "if (true) 2 else"',
  });
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

test("returns a structured error for assigning a boolean to a numeric binding", () => {
  expectError("let mut x = 0; x = false;", {
    kind: "type-mismatch",
    input: "let mut x = 0; x = false;",
    name: "x",
    reason: 'Cannot assign boolean literal to number variable "x" in "let mut x = 0; x = false;"',
  });
});

// Coverage: number literal assigned to a boolean binding (type-mismatch, from number).
test("returns a structured error for assigning a number to a boolean binding", () => {
  expectError("let mut x = true; x = 1;", {
    kind: "type-mismatch",
    input: "let mut x = true; x = 1;",
    name: "x",
    reason: 'Cannot assign number literal to boolean variable "x" in "let mut x = true; x = 1;"',
  });
});

// Coverage: type-mismatch through a mutable reference write.
test("returns a structured error for a boolean write through a numeric reference", () => {
  expectError("let mut x = 0; let y = &mut x; *y = true;", {
    kind: "type-mismatch",
    input: "let mut x = 0; let y = &mut x; *y = true;",
    name: "y",
    reason:
      'Cannot assign boolean literal to number variable "y" in "let mut x = 0; let y = &mut x; *y = true;"',
  });
});

// Coverage: non-literal right-hand side never mismatches (identifier RHS).
test("returns 0 for assigning an identifier to a numeric binding", () => {
  expect(evaluate("let mut x = 0; let y = 1; x = y;")).toEqual({ ok: true, value: 0 });
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

test("returns 1 for a statement block with no trailing expression", () => {
  expect(evaluate("let mut x = 0; { x = 1; } x")).toEqual({ ok: true, value: 1 });
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

test("returns a structured error for a block with no trailing expression", () => {
  expectError("let x = { let y = 0; }; x", {
    kind: "malformed-expression",
    input: "let x = { let y = 0; }; x",
    reason: 'Unexpected end of expression in "let x = { let y = 0; }; x"',
  });
});

test("returns a structured error for a block of only an assignment", () => {
  expectError("let mut x = 0; let y = { x = 1; }; y", {
    kind: "malformed-expression",
    input: "let mut x = 0; let y = { x = 1; }; y",
    reason: 'Unexpected end of expression in "let mut x = 0; let y = { x = 1; }; y"',
  });
});

test("returns a structured error for an expression block containing only a statement block", () => {
  expectError("let x = { {} };", {
    kind: "malformed-expression",
    input: "let x = { {} };",
    reason: 'Unexpected end of expression in "let x = { {} };"',
  });
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

// Coverage: statements end with no final expression (parseProgram atEnd branch).
test("returns 0 for statements with no final expression", () => {
  expect(evaluate("let x = 1;")).toEqual({ ok: true, value: 0 });
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

// Coverage: statement block whose trailing expression is unclosed.
test("returns a structured error for an unclosed statement block", () => {
  expectError("let mut x = 0; { x = 1; x", {
    kind: "malformed-expression",
    input: "let mut x = 0; { x = 1; x",
    reason: 'Unexpected end of expression in "let mut x = 0; { x = 1; x"',
  });
});

// Coverage: statement block containing a malformed statement.
test("returns a structured error for a statement block with a malformed statement", () => {
  expectError("let mut x = 0; { let y 1; }", {
    kind: "malformed-expression",
    input: "let mut x = 0; { let y 1; }",
    reason: 'Unexpected end of expression in "let mut x = 0; { let y 1; }"',
  });
});

// Coverage: expression block containing a malformed statement.
test("returns a structured error for an expression block with a malformed statement", () => {
  expectError("1 + { let x 1; x }", {
    kind: "malformed-expression",
    input: "1 + { let x 1; x }",
    reason: 'Unexpected end of expression in "1 + { let x 1; x }"',
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
