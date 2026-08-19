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
test("evaluate returns an ImmutableAssignment error when assigning to a non-mut variable", () => {
  expect(evaluate("let x = 0; x = 1; return x;")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "x", index: 1 },
  });
});
test("evaluate returns an UnknownIdentifier error for an undeclared variable", () => {
  expect(evaluate("return y;")).toEqual({
    ok: false,
    error: { kind: "UnknownIdentifier", name: "y", index: 0 },
  });
});
test("evaluate returns an UnexpectedStatement error for unrecognized input", () => {
  expect(evaluate("garbage")).toEqual({
    ok: false,
    error: { kind: "UnexpectedStatement", statement: "garbage", index: 0 },
  });
});
test("evaluate returns a MissingReturn error when no return statement is present", () => {
  expect(evaluate("let x = 1;")).toEqual({ ok: false, error: { kind: "MissingReturn" } });
});
