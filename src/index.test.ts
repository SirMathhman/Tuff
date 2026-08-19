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
  expect(evaluate("let x = 1; let y = &x; let z = &y; return **z;")).toEqual({
    ok: true,
    value: 1,
  });
});
test('evaluate returns 1 for "let mut x = 0; let y = &mut x; *y = 1; return x;"', () => {
  expect(evaluate("let mut x = 0; let y = &mut x; *y = 1; return x;")).toEqual({
    ok: true,
    value: 1,
  });
});
test('evaluate returns 1 for "let mut x = 0; let y = &mut x; *y = 1; return *y;"', () => {
  expect(evaluate("let mut x = 0; let y = &mut x; *y = 1; return *y;")).toEqual({
    ok: true,
    value: 1,
  });
});
test('evaluate returns 3 for "let mut x = 1; let y = &mut x; *y += 2; return x;"', () => {
  expect(evaluate("let mut x = 1; let y = &mut x; *y += 2; return x;")).toEqual({
    ok: true,
    value: 3,
  });
});
test("evaluate returns an ImmutableAssignment error when writing through an immutable pointer", () => {
  expect(evaluate("let x = 0; let y = &x; *y = 1; return x;")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "y", position: 23 },
  });
});
test("evaluate returns a TypeMismatch error when writing a bool through a number pointer", () => {
  expect(evaluate("let mut x = 0; let y = &mut x; *y = true; return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "y", expected: "number", actual: "bool", position: 31 },
  });
});
test('evaluate returns 6 for "let array = [1, 2, 3]; return array[0] + array[1] + array[2];"', () => {
  expect(evaluate("let array = [1, 2, 3]; return array[0] + array[1] + array[2];")).toEqual({
    ok: true,
    value: 6,
  });
});
test('evaluate returns 3 for "let array = [1, 2, 3]; return array[2];"', () => {
  expect(evaluate("let array = [1, 2, 3]; return array[2];")).toEqual({ ok: true, value: 3 });
});
test('evaluate returns 1 for "return [1, 2, 3][0];"', () => {
  expect(evaluate("return [1, 2, 3][0];")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 4 for "let array = [1, 2, 3]; return array[0] + 3;"', () => {
  expect(evaluate("let array = [1, 2, 3]; return array[0] + 3;")).toEqual({ ok: true, value: 4 });
});
test('evaluate returns 1 for "let array = [1, 2, 3]; return array[0] == 1;"', () => {
  expect(evaluate("let array = [1, 2, 3]; return array[0] == 1;")).toEqual({ ok: true, value: 1 });
});
test('evaluate returns 1 for "let mut array = [0]; array[0] = 1; return array[0];"', () => {
  expect(evaluate("let mut array = [0]; array[0] = 1; return array[0];")).toEqual({
    ok: true,
    value: 1,
  });
});
test('evaluate returns 4 for "let mut array = [1, 2]; array[1] = 3; return array[0] + array[1];"', () => {
  expect(evaluate("let mut array = [1, 2]; array[1] = 3; return array[0] + array[1];")).toEqual({
    ok: true,
    value: 4,
  });
});
test('evaluate returns 1 for "let mut array = [0]; array[0] += 1; return array[0];"', () => {
  expect(evaluate("let mut array = [0]; array[0] += 1; return array[0];")).toEqual({
    ok: true,
    value: 1,
  });
});
test('evaluate returns 5 for "let mut array = [0]; let p = &mut array; p[0] = 5; return array[0];"', () => {
  expect(evaluate("let mut array = [0]; let p = &mut array; p[0] = 5; return array[0];")).toEqual({
    ok: true,
    value: 5,
  });
});
test("evaluate returns an ImmutableAssignment error when indexing into a non-mut array", () => {
  expect(evaluate("let array = [0]; array[0] = 1; return array[0];")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "array", position: 17 },
  });
});
test("evaluate returns a TypeMismatch error when assigning a bool into a number array", () => {
  expect(evaluate("let mut array = [0]; array[0] = true; return array[0];")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "array",
      expected: "number",
      actual: "bool",
      position: 26,
    },
  });
});
test("evaluate returns a TypeMismatch error when indexing into a non-array", () => {
  expect(evaluate("let mut x = 1; x[0] = 2; return x;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "[",
      expected: "array<number>",
      actual: "number",
      position: 16,
    },
  });
});
test("evaluate returns a TypeMismatch error for a non-number index in an assignment", () => {
  expect(evaluate("let mut array = [0]; array[true] = 1; return array[0];")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "[",
      expected: "number",
      actual: "bool",
      position: 27,
    },
  });
});
test("evaluate returns a TypeMismatch error for a heterogeneous array literal", () => {
  expect(evaluate("let array = [1, true]; return array[0];")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "[", expected: "number", actual: "bool", position: 16 },
  });
});
test("evaluate returns a TypeMismatch error when indexing a non-array", () => {
  expect(evaluate("let x = 1; return x[0];")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "[",
      expected: "array<number>",
      actual: "number",
      position: 19,
    },
  });
});
test("evaluate returns a TypeMismatch error when adding a bool", () => {
  expect(evaluate("return true + 1;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "+", expected: "number", actual: "bool", position: 7 },
  });
});
// Coverage for the typecheck pass rejecting pointer operands to ordering operators.
test("evaluate returns a TypeMismatch error for a pointer operand to an ordering operator", () => {
  expect(evaluate("let a = 1; let p = &a; return p < p;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "<",
      expected: "number",
      actual: "ptr<number>",
      position: 30,
    },
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
test('evaluate returns 1 for "let mut x = 0; while (x < 4) { x += 1; break; } return x;"', () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; break; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});
test("evaluate returns a BreakOutsideLoop error for a break outside a while loop", () => {
  expect(evaluate("break; return 1;")).toEqual({
    ok: false,
    error: { kind: "BreakOutsideLoop", position: 0 },
  });
});
test('evaluate returns 4 for "let mut x = 0; while (x < 4) { x += 1; continue; } return x;"', () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; continue; } return x;")).toEqual({
    ok: true,
    value: 4,
  });
});
test("evaluate returns a ContinueOutsideLoop error for a continue outside a while loop", () => {
  expect(evaluate("continue; return 1;")).toEqual({
    ok: false,
    error: { kind: "ContinueOutsideLoop", position: 0 },
  });
});
