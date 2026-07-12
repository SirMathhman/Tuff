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

test("whitespace-only source compiles and exits with code 0", () => {
  expectValid(" ", "", 0);
});

test("read() reads stdin and returns as exit code", () => {
  expectValid("read()", "1", 1);
});

test("read() reads only first token from multi-value stdin", () => {
  expectValid("read()", "1 2", 1);
});

test("multiple read() calls consume tokens sequentially", () => {
  expectValid("read() + read()", "1 2", 3);
});

test("three read() calls sum to exit code", () => {
  expectValid("read() + read() + read()", "1 2 3", 6);
});

test("mixed arithmetic with multiple read() calls", () => {
  expectValid("read() + read() - read()", "3 2 4", 1);
});

test("operator precedence: multiplication before addition", () => {
  expectValid("read() + read() * read()", "3 2 4", 11);
});

test("parentheses override operator precedence", () => {
  expectValid("(read() + read()) * read()", "3 2 4", 20);
});

test("variable declaration with let and expression return", () => {
  expectValid("let x = read(); x", "3 2 4", 3);
});

test("variable used in arithmetic expression", () => {
  expectValid("let x = read(); x + x", "3 2 4", 6);
});

test("read() inside curly braces", () => {
  expectValid("let x = { read() }; x", "3", 3);
});

test("block with nested variable declaration returns value", () => {
  expectValid("let x = { let y = read(); y }; x", "3", 3);
});

test("mutable variable reassignment", () => {
  expectValid("let mut x = read(); x = read(); x", "3 4", 4);
});

test("reassigning immutable variable throws error", () => {
  expectInvalid("let x = read(); x = read(); x");
});

test("function declaration and call", () => {
  expectValid("fn get() => read(); get()", "1", 1);
});

test("invalid source throws error", () => {
  expectInvalid("invalid");
});
