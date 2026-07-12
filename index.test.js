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

test("multiple read() calls consume tokens sequentially", () => {
  expectValid("read() + read()", "1 2", 3);
});

test("block expressions work with read()", () => {
  expectValid("read() + { read() }", "1 2", 3);
});

test("blocks support let declarations and statements", () => {
  expectValid("read() + { let x = read(); x }", "1 2", 3);
});

test("top-level let with nested block expressions", () => {
  expectValid("let y = read() + { let x = read(); x }; y", "1 2", 3);
});

test("multi-character identifiers work in valid contexts", () => {
  expectValid("let invalid = read(); invalid", "1", 1);
});

test("numeric type suffixes like U8 are supported", () => {
  expectValid("read() + 100U8", "1", 101);
});

test("bare numeric literal with type suffix is invalid", () => {
  expectInvalid("256U8");
});

test("negative value with unsigned type suffix is invalid", () => {
  expectInvalid("-1U8");
});

test("invalid source throws error", () => {
  expectInvalid("invalid");
});
