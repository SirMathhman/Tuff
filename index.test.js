import { test, expect } from "@jest/globals";
import { compileTuffToJS } from ".";

function expectValid(source, args, expectedExitCode) {
  const generated = compileTuffToJS(source);
  try {
    const actualExitCode = new Function("args", generated)(args);
    expect(actualExitCode).toBe(expectedExitCode);
  } catch (e) {
    throw new Error("Failed to execute generated code: '" + generated + "'", e);
  }
}

function expectInvalid(source) {
  expect(() => compileTuffToJS(source)).toThrow();
}

test("empty source compiles and returns 0", () => {
  expectValid("", [], 0);
});

test("whitespace-only source compiles and returns 0", () => {
  expectValid(" ", [], 0);
});

test("__args__.length with no args returns 1", () => {
  expectValid("__args__.length", [], 1);
});

test("__args__[1].length accesses first argument length", () => {
  expectValid("__args__[1].length", ["foo"], 3);
});

test("let variable assignment and property access works", () => {
  expectValid("let temp = __args__; temp.length", [], 1);
});

test("mut variables can be reassigned", () => {
  expectValid(
    "let mut a = __args__[1].length; a = __args__[2].length; a",
    ["a", "ab"],
    2,
  );
});

test("reassigning immutable variable is invalid", () => {
  expectInvalid("let a = __args__[1].length; a = __args__[2].length; a");
});

test("block scope with mut variable reassignment works", () => {
  expectValid("let mut x = 0; { x = 1; } x", [], 1);
});

test("variable shadowing allows redeclaration", () => {
  expectValid("let x = 0; let x = 1; x", [], 1);
});

test("inner block variable does not leak out of scope", () => {
  expectValid("let x = 1; { let x = 0; } x", [], 1);
});

test("if statement with true condition executes body", () => {
  expectValid("let mut x = 0; if (true) x = 1; x", [], 1);
});

test("if-else statement with false condition executes else branch", () => {
  expectValid("let mut x = 0; if (false) x = 1; else x = 2; x", [], 2);
});

test("if-else with block bodies executes correct branch", () => {
  expectValid("let mut x = 0; if (false) { x = 1; } else { x = 2; } x", [], 2);
});

test("chained else-if with block bodies executes final else branch", () => {
  expectValid(
    "let mut x = 0; if (false) { x = 1; } else if (false) { x = 2; } else { x = 3; } x",
    [],
    3,
  );
});

test("array literal and indexing works", () => {
  expectValid(
    "let array = [1, 2, 3]; array[1]",
    [],
    2,
  );
});

test("array element mutation works", () => {
  expectValid(
    "let mut array = [0]; array[0] = 2; array[0]",
    [],
    2,
  );
});
