import { evaluate } from "./index.js";

test("evaluate returns an EmptyProgram error for an empty string", () => {
  expect(evaluate("")).toEqual({ ok: false, error: { kind: "EmptyProgram" } });
});
test('evaluate returns 1 for "return 1;"', () => {
  expect(evaluate("return 1;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let x = 1; return x;"', () => {
  expect(evaluate("let x = 1; return x;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let mut x = 0; x = 1; return x;"', () => {
  expect(evaluate("let mut x = 0; x = 1; return x;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let mut x = 0; { x = 1; } return x;"', () => {
  expect(evaluate("let mut x = 0; { x = 1; } return x;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let x = true; return x;"', () => {
  expect(evaluate("let x = true; return x;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 0 for "let x = 1; let y = 2; return x == y;"', () => {
  expect(evaluate("let x = 1; let y = 2; return x == y;")).toEqual({ ok: true, value: 0 });
});
test('evaluate returns 0 for "return true == 1;"', () => {
  expect(evaluate("return true == 1;")).toEqual({ ok: true, value: 0 });
});
test('evaluate returns 1 for "let x = 0; let y = 1; return x < y;"', () => {
  expect(evaluate("let x = 0; let y = 1; return x < y;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let x = 1; let y = 1; return x <= y;"', () => {
  expect(evaluate("let x = 1; let y = 1; return x <= y;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let x = 2; let y = 1; return x > y;"', () => {
  expect(evaluate("let x = 2; let y = 1; return x > y;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let x = 1; let y = 1; return x >= y;"', () => {
  expect(evaluate("let x = 1; let y = 1; return x >= y;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let x = 1; let y = 2; return x != y;"', () => {
  expect(evaluate("let x = 1; let y = 2; return x != y;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 3 for "let mut x = 1; x += 2; return x;"', () => {
  expect(evaluate("let mut x = 1; x += 2; return x;")).toEqual({ ok: true, value: 3 });
});
test('evaluate returns 1 for "let x = 1; let y = &x; return *y;"', () => {
  expect(evaluate("let x = 1; let y = &x; return *y;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let x = 1; let y = &x; let z = &y; return **z;"', () => {
  expect(evaluate("let x = 1; let y = &x; let z = &y; return **z;")).toEqual({ ok: true, value: 1 });
});
// Coverage for the typecheck pass rejecting pointer operands to ordering operators.
test("evaluate returns a TypeMismatch error for a pointer operand to an ordering operator", () => {
  expect(evaluate("let a = 1; let p = &a; return p < p;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "<", expected: "number", actual: "ptr<number>", position: 30 },
  });
});
test('evaluate returns 2 for "let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;"', () => {
  expect(evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;")).toEqual({
    ok: true,
    value: 2,
  });
});
test('evaluate returns 4 for "let mut x = 0; while (x < 4) { x += 1; } return x;"', () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; } return x;")).toEqual({
    ok: true,
    value: 4,
  });
});
test("evaluate returns an ImmutableAssignment error when assigning to a non-mut variable", () => {
  expect(evaluate("let x = 0; x = 1; return x;")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "x", position: 11 },
  });
});
test("evaluate returns a TypeMismatch error when assigning a bool to a number variable", () => {
  expect(evaluate("let mut x = 0; x = true;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "number", actual: "bool", position: 15 },
  });
});
test("evaluate returns a TypeMismatch error for a type error in a never-executed branch", () => {
  expect(evaluate("let mut x = 0; if (false) { x = true; } return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "number", actual: "bool", position: 28 },
  });
});
test("evaluate returns an UnknownIdentifier error for an undeclared variable", () => {
  expect(evaluate("return y;")).toEqual({
    ok: false,
    error: { kind: "UnknownIdentifier", name: "y", position: 7 },
  });
});
test("evaluate returns an UnexpectedStatement error for unrecognized input", () => {
  expect(evaluate("garbage")).toEqual({
    ok: false,
    error: { kind: "UnexpectedStatement", statement: "garbage", position: 0 },
  });
});
test("evaluate returns a MissingReturn error when no return statement is present", () => {
  expect(evaluate("let x = 1;")).toEqual({ ok: false, error: { kind: "MissingReturn" } });
});
