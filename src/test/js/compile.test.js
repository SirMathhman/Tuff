import { test, expect } from "bun:test";
import { compile } from "../../main/js/compile";

function expectValid(source, args, expectedExitCode) {
  const result = compile(source);
  expect(result.ok).toBe(true);

  const argsCopy = ["node", "test.js", ...args];
  const actualExitCode = Function("__args__", result.value)(argsCopy);
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

test("__args__.length returns 2 for empty args", () => {
  expectValid("__args__.length", [], 2);
});

test("let declaration with property access", () => {
  expectValid("let temp = __args__; temp.length", [], 2);
});

test("multiple let declarations with property access", () => {
  expectValid("let foo = __args__; let bar = foo; bar.length", [], 2);
});

test("let declaration with numeric literal", () => {
  expectValid("let foo = 100; foo", [], 100);
});
