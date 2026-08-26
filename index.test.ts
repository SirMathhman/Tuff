import { expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

test("empty string returns 0", () => {
  expect(evaluateTuff("")).toEqual({ ok: true, value: 0 });
});

test("no return statement returns 0", () => {
  expect(evaluateTuff("let mut x = 0; x = 1;")).toEqual({ ok: true, value: 0 });
});

test("return statement returns the number", () => {
  expect(evaluateTuff("return 1;")).toEqual({ ok: true, value: 1 });
});
test("let declaration then return variable", () => {
  expect(evaluateTuff("let x = 1; return x;")).toEqual({
    ok: true,
    value: 1,
  });
});
test("redeclaration shadows previous value", () => {
  expect(evaluateTuff("let x = 1; let x = 2; return x;")).toEqual({
    ok: true,
    value: 2,
  });
});
test("mut declaration then assignment", () => {
  expect(evaluateTuff("let mut x = 0; x = 1; return x;")).toEqual({
    ok: true,
    value: 1,
  });
});
test("compound addition assignment", () => {
  expect(evaluateTuff("let mut x = 1; x += 2; return x;")).toEqual({
    ok: true,
    value: 3,
  });
});
test("block statement assigns to outer scope", () => {
  expect(evaluateTuff("let mut x = 0; { x = 1; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});
test("if/else executes the matching branch", () => {
  expect(
    evaluateTuff(
      "let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;",
    ),
  ).toEqual({ ok: true, value: 2 });
});
test("if without else skips the branch when false", () => {
  expect(
    evaluateTuff("let mut x = 0; if (false) { x = 1; } return x;"),
  ).toEqual({ ok: true, value: 0 });
});
test("while loop runs until the condition is false", () => {
  expect(
    evaluateTuff("let mut x = 0; while (x < 4) { x += 1; } return x;"),
  ).toEqual({ ok: true, value: 4 });
});
test("while loop with brace-less body", () => {
  expect(
    evaluateTuff("let mut x = 0; while (x < 4) x += 1; return x;"),
  ).toEqual({ ok: true, value: 4 });
});
test("for loop over a range", () => {
  expect(
    evaluateTuff("let mut sum = 0; for (i in 0..4) { sum += i; } return sum;"),
  ).toEqual({ ok: true, value: 6 });
});
test("tuple field access", () => {
  expect(evaluateTuff("let tuple = (3, 4); return tuple.0 + tuple.1;")).toEqual(
    { ok: true, value: 7 },
  );
});
test("array index access", () => {
  expect(
    evaluateTuff(
      "let array = [1, 2, 3]; return array[0] + array[1] + array[2];",
    ),
  ).toEqual({ ok: true, value: 6 });
});
test("returning a tuple returns Err", () => {
  expect(evaluateTuff("return (1, 2);")).toEqual({
    ok: false,
    error: {
      type: "OperandTypeMismatch",
      position: 7,
      expected: "number | boolean",
      actual: "tuple",
    },
  });
});
test("assignment to immutable binding returns Err", () => {
  expect(evaluateTuff("let x = 0; x = 1; return x;")).toEqual({
    ok: false,
    error: { type: "ImmutableAssignment", name: "x", position: 11 },
  });
});
test("assigning a boolean to a number binding returns Err", () => {
  expect(evaluateTuff("let mut x = 0; x = true;")).toEqual({
    ok: false,
    error: {
      type: "TypeMismatch",
      name: "x",
      position: 15,
      expected: "number",
      actual: "boolean",
    },
  });
});
test("type mismatch in unexecuted if branch returns Err", () => {
  expect(evaluateTuff("if (false) { let mut x = 0; x = true; }")).toEqual({
    ok: false,
    error: {
      type: "TypeMismatch",
      name: "x",
      position: 28,
      expected: "number",
      actual: "boolean",
    },
  });
});
test("unknown identifier in unexecuted if branch returns Err", () => {
  expect(evaluateTuff("if (false) { let y = unknownIdentifier; }")).toEqual({
    ok: false,
    error: { type: "UnknownIdentifier", name: "unknownIdentifier" },
  });
});
test("unknown identifier in if condition returns Err", () => {
  expect(evaluateTuff("if (undeclared) {}")).toEqual({
    ok: false,
    error: { type: "UnknownIdentifier", name: "undeclared" },
  });
});
test("assignment to undeclared variable returns Err", () => {
  expect(evaluateTuff("x = 5;")).toEqual({
    ok: false,
    error: { type: "UnknownIdentifier", name: "x" },
  });
});
test("immutable assignment in unexecuted if branch returns Err", () => {
  expect(evaluateTuff("if (false) { let x = 0; x = 1; }")).toEqual({
    ok: false,
    error: { type: "ImmutableAssignment", name: "x", position: 24 },
  });
});
test("assignment to undeclared variable in unexecuted if branch returns Err", () => {
  expect(evaluateTuff("if (false) { x = 1; }")).toEqual({
    ok: false,
    error: { type: "UnknownIdentifier", name: "x" },
  });
});
test("malformed statement returns ParseError", () => {
  expect(evaluateTuff("let x = ;")).toEqual({
    ok: false,
    error: {
      type: "ParseError",
      message: "Expected expression, got: ;",
      position: 8,
    },
  });
});
