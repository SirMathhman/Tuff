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
