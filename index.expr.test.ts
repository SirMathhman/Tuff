import { expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

test("return of unknown identifier returns Err", () => {
  expect(evaluateTuff("return unknownIdentifier;")).toEqual({
    ok: false,
    error: { type: "UnknownIdentifier", name: "unknownIdentifier" },
  });
});
test("boolean literal evaluates to 1", () => {
  expect(evaluateTuff("let x = true; return x;")).toEqual({
    ok: true,
    value: 1,
  });
});
test("logical or of booleans", () => {
  expect(evaluateTuff("let x = true; let y = false; return x || y;")).toEqual({
    ok: true,
    value: 1,
  });
});
test("equality of unequal numbers is 0", () => {
  expect(evaluateTuff("let x = 1; let y = 2; return x == y;")).toEqual({
    ok: true,
    value: 0,
  });
});
test("equality of number and boolean is 0", () => {
  expect(evaluateTuff("let x = 1; let y = true; return x == y;")).toEqual({
    ok: true,
    value: 0,
  });
});
test("less-than of numbers", () => {
  expect(evaluateTuff("let x = 1; let y = 2; return x < y;")).toEqual({
    ok: true,
    value: 1,
  });
});
test("less-than of equal numbers is 0", () => {
  expect(evaluateTuff("let x = 2; let y = 2; return x < y;")).toEqual({
    ok: true,
    value: 0,
  });
});
test("less-than of number and boolean is 0", () => {
  expect(evaluateTuff("let x = 1; let y = true; return x < y;")).toEqual({
    ok: true,
    value: 0,
  });
});
test("addition of numbers", () => {
  expect(evaluateTuff("return 1 + 2;")).toEqual({
    ok: true,
    value: 3,
  });
});
test("addition with a boolean operand returns Err", () => {
  expect(evaluateTuff("let x = true; return 1 + x;")).toEqual({
    ok: false,
    error: {
      type: "OperandTypeMismatch",
      position: 25,
      expected: "number",
      actual: "boolean",
    },
  });
});
test("subtraction of numbers", () => {
  expect(evaluateTuff("return 5 - 2;")).toEqual({
    ok: true,
    value: 3,
  });
});
test("subtraction can yield a negative number", () => {
  expect(evaluateTuff("return 2 - 5;")).toEqual({
    ok: true,
    value: -3,
  });
});
test("multiplication of numbers", () => {
  expect(evaluateTuff("return 3 * 4;")).toEqual({
    ok: true,
    value: 12,
  });
});
test("multiplication binds tighter than addition", () => {
  expect(evaluateTuff("return 2 + 3 * 4;")).toEqual({
    ok: true,
    value: 14,
  });
});
test("subtraction with a boolean operand returns Err", () => {
  expect(evaluateTuff("let x = true; return 1 - x;")).toEqual({
    ok: false,
    error: {
      type: "OperandTypeMismatch",
      position: 25,
      expected: "number",
      actual: "boolean",
    },
  });
});
test("multiplication with a boolean operand returns Err", () => {
  expect(evaluateTuff("let x = true; return 1 * x;")).toEqual({
    ok: false,
    error: {
      type: "OperandTypeMismatch",
      position: 25,
      expected: "number",
      actual: "boolean",
    },
  });
});
test("identifier declared in a block is not visible after it", () => {
  expect(evaluateTuff("{ let x = 0; } return x;")).toEqual({
    ok: false,
    error: { type: "UnknownIdentifier", name: "x" },
  });
});
test("identifier declared in an if branch is not visible after it", () => {
  expect(evaluateTuff("if (false) { let x = 0; } return x;")).toEqual({
    ok: false,
    error: { type: "UnknownIdentifier", name: "x" },
  });
});
test("block expression evaluates to the value it returns", () => {
  expect(evaluateTuff("let x = { let y = 1; y }; x")).toEqual({
    ok: true,
    value: 1,
  });
});
test("block expression with no return evaluates to 0", () => {
  expect(evaluateTuff("let x = { let y = 1; }; return x;")).toEqual({
    ok: true,
    value: 0,
  });
});
test("block expression is an operand of the enclosing expression", () => {
  expect(evaluateTuff("let x = { let y = 1; y } + 10; return x;")).toEqual({
    ok: true,
    value: 11,
  });
});
test("identifier declared in a block expression is not visible after it", () => {
  expect(evaluateTuff("let x = { let y = 1; y }; return y;")).toEqual({
    ok: false,
    error: { type: "UnknownIdentifier", name: "y" },
  });
});
test("block expression shadows an outer binding only inside itself", () => {
  expect(evaluateTuff("let y = 5; let x = { let y = 1; y }; return y;")).toEqual(
    { ok: true, value: 5 },
  );
});
test("block expression returning a tuple returns Err", () => {
  expect(evaluateTuff("let x = { let y = (1, 2); y }; return x;")).toEqual({
    ok: false,
    error: {
      type: "OperandTypeMismatch",
      position: 26,
      expected: "number | boolean",
      actual: "tuple",
    },
  });
});
