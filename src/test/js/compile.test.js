import { test, expect } from "bun:test";
import { compile } from "../../main/js/compile";

function expectValid(source, args, expectedExitCode) {
  const result = compile(source);
  expect(result.ok).toBe(true);
  const actualExitCode = Function("__args__", result.code)(args);
  expect(actualExitCode).toBe(expectedExitCode);
}

function expectInvalid(source, expectedError) {
  const result = compile(source);
  expect(result.ok).toBe(false);
  if (expectedError !== undefined) {
    expect(result.error).toBe(expectedError);
  }
}

test("empty source compiles to valid empty program", () => {
  expectValid("", "", 0);
});

test("invalid source throws an error", () => {
  expectInvalid("garbage@#!", "Unknown source code: garbage@#!");
});
