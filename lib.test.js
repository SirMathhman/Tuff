import { test, expect } from "@jest/globals";
import { compileTuffToJS } from "./lib";

function expectValid(source, stdIn, expectedExitCode) {
  const result = compileTuffToJS(source);
  if (result.variant === "err") throw new Error(result.error);
  const actualExitCode = new Function("stdIn", result.value)(stdIn);
  expect(expectedExitCode).toBe(actualExitCode);
}

function expectInvalid(source) {
  expect(compileTuffToJS(source).variant).toBe("err");
}

test("empty source compiles and exits with code 0", () => {
  expectValid("", "", 0);
});
