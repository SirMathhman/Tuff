import { test, expect } from "bun:test";
import { compile } from ".";
import { act } from "react";

function expectValid(source, stdIn, expectedExitCode) {
  const generated = compile(source);
  try {
    const actualExitCode = new Function("stdIn", generated)(stdIn);
    if (actualExitCode !== expectedExitCode) {
      throw new Error(
        "Expected '" +
          expectedExitCode +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: '" +
          generated +
          "'",
      );
    }
  } catch (e) {
    throw new Error("Failed to execute generated code: '" + generated + "'", e);
  }
}

function expectInvalid(source) {
  expect(() => compile(source)).toThrow();
}

test("empty source compiles and exits with code 0", () => {
  expectValid("", "", 0);
});

test("whitespace-only source compiles and exits with code 0", () => {
  expectValid(" ", "", 0);
});
