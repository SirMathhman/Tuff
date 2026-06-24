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

test("read() returns parsed stdin as exit code", () => {
  expectValid("read()", "100", 100);
});

test("read() parses first token from multi-token stdin", () => {
  expectValid("read()", "100 20", 100);
});

test("multiple read() calls consume tokens sequentially, last value wins", () => {
  expectValid("read(); read()", "100 20", 20);
});
