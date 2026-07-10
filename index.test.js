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
