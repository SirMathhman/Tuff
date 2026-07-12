import { expect, test } from "bun:test";
import { compile } from ".";

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

test("read() returns stdin value", () => {
  expectValid("read()", "1", 1);
});

test("read() parses first token from multi-value input", () => {
  expectValid("read()", "1 2", 1);
});

test("invalid source throws error", () => {
  expectInvalid("invalid");
});
