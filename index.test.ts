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
