import { expect, test } from "bun:test";
import { describeError, evaluateTuff, TuffErrorKind } from "./index.ts";

test('evaluateTuff("1") => 1', () => {
  expect(evaluateTuff("1")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("1 + 2") => 3', () => {
  expect(evaluateTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test("empty and whitespace-only input is an UnexpectedEnd error, not 0", () => {
  expect(evaluateTuff("")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedEnd, span: { start: 0, end: 0 } },
  });
  expect(evaluateTuff("  ")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedEnd, span: { start: 2, end: 2 } },
  });
});

test('evaluateTuff("abc") is an UnknownName error spanning "abc"', () => {
  expect(evaluateTuff("abc")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnknownName, span: { start: 0, end: 3 } },
  });
});

test('evaluateTuff("1 / 0") is a DivisionByZero error spanning the "/"', () => {
  expect(evaluateTuff("1 / 0")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DivisionByZero, span: { start: 2, end: 3 } },
  });
});

test('evaluateTuff("{ 2 + 3 } * 4") => 20', () => {
  expect(evaluateTuff("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test('evaluateTuff("0 / 0") is a DivisionByZero error spanning the "/"', () => {
  expect(evaluateTuff("0 / 0")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DivisionByZero, span: { start: 2, end: 3 } },
  });
});

test('evaluateTuff("7 / 2") => 3 (integer division)', () => {
  expect(evaluateTuff("7 / 2")).toEqual({ ok: true, value: 3 });
});

test("a literal that overflows to Infinity is a NumericOverflow error", () => {
  const literal = "1" + "0".repeat(400);
  expect(evaluateTuff(literal)).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NumericOverflow, span: { start: 0, end: 401 } },
  });
});

test("nesting deeper than 256 groups is a NestingTooDeep error, not a stack crash", () => {
  const source = "(".repeat(257) + "1" + ")".repeat(257);
  expect(evaluateTuff(source)).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NestingTooDeep, span: { start: 256, end: 257 } },
  });
});

test('evaluateTuff("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(evaluateTuff("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
});

test('evaluateTuff("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(evaluateTuff("let y = { let x = 2 + 3; x } * 4; y")).toEqual({ ok: true, value: 20 });
});

test('evaluateTuff("x") is an UnknownName error spanning "x"', () => {
  expect(evaluateTuff("x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnknownName, span: { start: 0, end: 1 } },
  });
});

test("re-declaring a name in the same block is a DuplicateName error", () => {
  expect(evaluateTuff("{ let x = 1; let x = 2; x }")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DuplicateName, span: { start: 17, end: 18 } },
  });
});

test("a name bound in a block is UnknownName after the block ends", () => {
  expect(evaluateTuff("{ let x = 1; x } + x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnknownName, span: { start: 19, end: 20 } },
  });
});

test("a binding is not visible before its declaration", () => {
  expect(evaluateTuff("let y = x; let x = 1; y")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnknownName, span: { start: 8, end: 9 } },
  });
});

test("a block may shadow an outer name", () => {
  expect(evaluateTuff("{ let x = 1; { let x = 2; x } + x }")).toEqual({ ok: true, value: 3 });
});

test("a name that is a host property such as constructor is an ordinary binding", () => {
  expect(evaluateTuff("{ let constructor = 1; constructor }")).toEqual({ ok: true, value: 1 });
});

test("unknown name in a left operand is reported before a division by zero", () => {
  expect(evaluateTuff("1 / 0 + x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnknownName, span: { start: 8, end: 9 } },
  });
});

test("a syntax error is reported before a division by zero", () => {
  expect(evaluateTuff("1 / 0 )")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedToken, span: { start: 6, end: 7 } },
  });
});

test("a duplicate name is reported before a division by zero", () => {
  expect(evaluateTuff("{ let x = 1 / 0; let x = 2; x }")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DuplicateName, span: { start: 21, end: 22 } },
  });
});

test("an empty block is an UnexpectedToken at its closing brace", () => {
  expect(evaluateTuff("{ }")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedToken, span: { start: 2, end: 3 } },
  });
});

test("a block without a closing brace is an UnexpectedEnd error", () => {
  expect(evaluateTuff("{ let x = 1; x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedEnd, span: { start: 14, end: 14 } },
  });
});

test("a let whose right-hand side uses its own name is UnknownName", () => {
  expect(evaluateTuff("{ let x = x; x }")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnknownName, span: { start: 10, end: 11 } },
  });
});

test("every error kind has a what, why, and fix, and where is its span", () => {
  for (const kind of Object.values(TuffErrorKind)) {
    const explanation = describeError({ kind, span: { start: 0, end: 1 } });
    expect(explanation.what).not.toBe("");
    expect(explanation.why).not.toBe("");
    expect(explanation.fix).not.toBe("");
    expect(explanation.where).toEqual({ start: 0, end: 1 });
  }
});

test('evaluateTuff("let mut x = 0; x = 1; x") => 1', () => {
  expect(evaluateTuff("let mut x = 0; x = 1; x")).toEqual({ ok: true, value: 1 });
});

test("an unknown name in a left operand is reported before an overflowing literal", () => {
  expect(evaluateTuff("y + " + "9".repeat(400))).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnknownName, span: { start: 0, end: 1 } },
  });
});

test("an overflowing left operand is reported before a division by zero", () => {
  expect(evaluateTuff("9".repeat(400) + " / 0")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NumericOverflow, span: { start: 0, end: 400 } },
  });
});

test("a division by zero is reported before a later overflowing literal", () => {
  expect(evaluateTuff("1 / 0 + " + "9".repeat(400))).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DivisionByZero, span: { start: 2, end: 3 } },
  });
});

test('evaluateTuff("let y = { let x = 0; };") is an UnexpectedToken error at the closing brace', () => {
  expect(evaluateTuff("let y = { let x = 0; };")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedToken, span: { start: 21, end: 22 } },
  });
});

test('evaluateTuff("let mut x = 0; x = 1;") => 0', () => {
  expect(evaluateTuff("let mut x = 0; x = 1;")).toEqual({ ok: true, value: 0 });
});

test("assigning a plain let binding is an ImmutableAssignment error", () => {
  expect(evaluateTuff("let x = 0; x = 1; x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.ImmutableAssignment, span: { start: 11, end: 12 } },
  });
});

test("a nested block may assign an enclosing let mut binding", () => {
  expect(evaluateTuff("{ let mut x = 0; { x = 1; 0 } + x }")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("let x = true; x") => 1', () => {
  expect(evaluateTuff("let x = true; x")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("true + 1") is a BooleanOperand error at the operator', () => {
  expect(evaluateTuff("true + 1")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.BooleanOperand, span: { start: 5, end: 6 } },
  });
});

test("true cannot be bound as a name", () => {
  expect(evaluateTuff("let true = 1; 2")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedToken, span: { start: 4, end: 8 } },
  });
});

test("hex and exponent forms are rejected", () => {
  expect(evaluateTuff("0x10")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedToken, span: { start: 1, end: 2 } },
  });
  expect(evaluateTuff("1e3")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnexpectedToken, span: { start: 1, end: 2 } },
  });
});

test('evaluateTuff("false + 1") is a BooleanOperand error at the operator', () => {
  expect(evaluateTuff("false + 1")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.BooleanOperand, span: { start: 6, end: 7 } },
  });
});

test('evaluateTuff("let x = true; x - 0") is a BooleanOperand error at the operator', () => {
  expect(evaluateTuff("let x = true; x - 0")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.BooleanOperand, span: { start: 16, end: 17 } },
  });
});

test('evaluateTuff("true + 1 / 0") reports the division by zero, not the boolean operand', () => {
  expect(evaluateTuff("true + 1 / 0")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DivisionByZero, span: { start: 9, end: 10 } },
  });
});

test('evaluateTuff("1 / 0 + true") reports the first division by zero', () => {
  expect(evaluateTuff("1 / 0 + true")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DivisionByZero, span: { start: 2, end: 3 } },
  });
});

test('evaluateTuff("{ true }") => 1', () => {
  expect(evaluateTuff("{ true }")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("let mut x = 1; x = true; x") is a TypeMismatch at the assignment target', () => {
  expect(evaluateTuff("let mut x = 1; x = true; x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.TypeMismatch, span: { start: 15, end: 16 } },
  });
});

test('evaluateTuff("let mut x = true; x = 0; x") is a TypeMismatch at the assignment target', () => {
  expect(evaluateTuff("let mut x = true; x = 0; x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.TypeMismatch, span: { start: 18, end: 19 } },
  });
});

test('evaluateTuff("let x = 1; let y = &x; *y") => 1', () => {
  expect(evaluateTuff("let x = 1; let y = &x; *y")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("let mut x = 1; let y = &mut x; *y = 2; x") => 2', () => {
  expect(evaluateTuff("let mut x = 1; let y = &mut x; *y = 2; x")).toEqual({ ok: true, value: 2 });
});

test("writing through a shared reference is an ImmutableAssignment error at the *", () => {
  expect(evaluateTuff("let x = 1; let y = &x; *y = 2; *y")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.ImmutableAssignment, span: { start: 23, end: 24 } },
  });
});

test("dereferencing a number is a NotAReference error at the *", () => {
  expect(evaluateTuff("let x = 1; *x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NotAReference, span: { start: 11, end: 12 } },
  });
});

test("a reference cannot outlive the block that declares its binding", () => {
  expect(evaluateTuff("let y = { let x = 1; &x }; *y")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.ReferenceEscapes, span: { start: 21, end: 22 } },
  });
});

test("a reference used as an arithmetic operand is a ReferenceAsValue error at the operator", () => {
  expect(evaluateTuff("let x = 1; let y = &x; y + 1")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.ReferenceAsValue, span: { start: 25, end: 26 } },
  });
});

test('evaluateTuff("let mut x = 0; let y = &mut x; let z = &y; *(*z) = 1; x") => 1', () => {
  expect(evaluateTuff("let mut x = 0; let y = &mut x; let z = &y; *(*z) = 1; x")).toEqual({ ok: true, value: 1 });
});

test("a reference that escapes its block through an outer assignment is a ReferenceEscapes error", () => {
  expect(evaluateTuff("let mut a = 1; let mut p = &a; let z = { let b = 2; p = &b; 0 }; *p")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.ReferenceEscapes, span: { start: 56, end: 57 } },
  });
});

test("writing through a shared reference is an ImmutableAssignment error at the statement", () => {
  expect(evaluateTuff("let mut x = 1; let r = &x; *r = 2; x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.ImmutableAssignment, span: { start: 27, end: 28 } },
  });
});

test("borrowing a plain let mutably is an ImmutableAssignment error at the name", () => {
  expect(evaluateTuff("let x = 1; let r = &mut x; r")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.ImmutableAssignment, span: { start: 24, end: 25 } },
  });
});

test("a reference used as an arithmetic operand is a ReferenceAsValue error at the operator", () => {
  expect(evaluateTuff("let x = 1; 1 + &x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.ReferenceAsValue, span: { start: 13, end: 14 } },
  });
});

test("dereferencing a number is a NotAReference error at the *", () => {
  expect(evaluateTuff("let x = 1; *x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NotAReference, span: { start: 11, end: 12 } },
  });
});

test("assigning a reference to a number binding is a TypeMismatch error at the target", () => {
  expect(evaluateTuff("let mut x = 1; x = &x; x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.TypeMismatch, span: { start: 15, end: 16 } },
  });
});

test("a run of 300 prefix stars is a NestingTooDeep error, not a stack overflow", () => {
  expect(evaluateTuff("let z = 1; " + "*".repeat(300) + "z")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NestingTooDeep, span: { start: 267, end: 268 } },
  });
});

test("255 prefix stars are still parsed; the error is a NotAReference, not a nesting error", () => {
  expect(evaluateTuff("let z = 1; " + "*".repeat(255) + "z")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NotAReference, span: { start: 265, end: 266 } },
  });
});

test("parentheses and prefix stars share one nesting budget", () => {
  expect(evaluateTuff("(".repeat(200) + "*".repeat(100) + "z")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NestingTooDeep, span: { start: 256, end: 257 } },
  });
});

test('evaluateTuff("*(3) = 1;") is a NotAReference error at the *', () => {
  expect(evaluateTuff("*(3) = 1;")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NotAReference, span: { start: 0, end: 1 } },
  });
});

test('evaluateTuff("if (true) 2 else 3") => 2', () => {
  expect(evaluateTuff("if (true) 2 else 3")).toEqual({ ok: true, value: 2 });
});

test("a non-boolean condition is a NotABoolean error at the condition", () => {
  expect(evaluateTuff("if (1) 2 else 3")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.NotABoolean, span: { start: 4, end: 5 } },
  });
});

test("an unknown name in the unchosen branch is still an UnknownName error", () => {
  expect(evaluateTuff("if (true) 2 else x")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.UnknownName, span: { start: 17, end: 18 } },
  });
});

test("an error in the unchosen branch is still reported", () => {
  expect(evaluateTuff("if (true) 2 else 1 / 0")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DivisionByZero, span: { start: 19, end: 20 } },
  });
});

test('evaluateTuff("if (true) 2 else { 1 / 0 }") is a DivisionByZero error at the /', () => {
  expect(evaluateTuff("if (true) 2 else { 1 / 0 }")).toEqual({
    ok: false,
    error: { kind: TuffErrorKind.DivisionByZero, span: { start: 21, end: 22 } },
  });
});

test("writes made in the unchosen branch are undone", () => {
  expect(evaluateTuff("let mut x = 0; let y = if (false) { x = 1; 0 } else 2; x")).toEqual({ ok: true, value: 0 });
});

test('evaluateTuff("let mut x = 0; let y = if (true) 2 else { x = 1; 1 }; x") => 0', () => {
  expect(evaluateTuff("let mut x = 0; let y = if (true) 2 else { x = 1; 1 }; x")).toEqual({ ok: true, value: 0 });
});
