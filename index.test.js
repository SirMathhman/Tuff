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

test("string literal .length returns character count", () => {
  expectValid('"foo".length', [], 3);
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

test("compound assignment += on mut variable works", () => {
  expectValid("let mut x = 0; x += 1; x", [], 1);
});

test("compound assignment += on immutable variable is invalid", () => {
  expectInvalid("let x = 0; x += 1; x");
});

test("while loop repeats body while condition is true", () => {
  expectValid("let mut x = 0; while (x < 4) x += 1; x", [], 4);
});

test("for-in-range loop iterates over range and accumulates values", () => {
  expectValid("let mut sum = 0; for (i in 0..4) sum += i; sum", [], 6);
});

test("for-in-range with variable range reference works", () => {
  expectValid(
    "let mut sum = 0; let range = 0..4; for (i in range) sum += i; sum",
    [],
    6,
  );
});

test("for-in-array iterates over array literal elements", () => {
  expectValid("let mut sum = 0; for (i in [3, 6, 2]) sum += i; sum", [], 11);
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

test("if condition can be a function call", () => {
  expectValid(
    "fn cond() => true; let mut x = 0; if (cond()) x = 1; else x = 2; x",
    [],
    1,
  );
});

test("array literal and indexing works", () => {
  expectValid("let array = [1, 2, 3]; array[1]", [], 2);
});

test("array element mutation works", () => {
  expectValid("let mut array = [0]; array[0] = 2; array[0]", [], 2);
});

test("block expression returns inner value", () => {
  expectValid("let x = { let y = 2; y }; x", [], 2);
});

test("yield in block expression returns early", () => {
  expectValid("let x = { if (true) yield 1; 3 } + 2; x", [], 3);
});

test("fn with block expression, yield, and trailing operator returns correct value", () => {
  expectValid("fn get() => { if (true) yield 1; 2 } + 3; get()", [], 4);
});

test("fn with block expression using return skips trailing operator", () => {
  expectValid("fn get() => { if (true) return 1; 2 } + 3; get()", [], 1);
});

test("fn definition and call with property access works", () => {
  expectValid("fn get() => __args__; get().length", ["foo"], 2);
});

test("fn with parameters performs arithmetic correctly", () => {
  expectValid("fn add(first, second) => first + second; add(3, 4)", [], 7);
});
