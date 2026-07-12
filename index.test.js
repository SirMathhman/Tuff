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

test("U16 and U32 types work correctly", () => {
  expectValid("read() + 50000U16", "1", 50001);
  expectValid("read() + 4000000000U32", "1", 4000000001);
});

test("I8, I16, and I32 types work correctly", () => {
  expectValid("read() - 50I8", "1", -49);
  expectValid("read() + 30000I16", "1", 30001);
});

test("typed variable declarations and typed read calls work correctly", () => {
  expectValid("let x : U8 = read<U8>(); x", "100", 100);
});

test("bare let declaration with no trailing expression returns 0", () => {
  expectValid("let x = read();", "100", 0);
});


test("narrower type assigned to wider declaration is valid", () => {
  expectValid("let x : U16 = read<U8>(); x", "100", 100);
});

test("wider type assigned to narrower declaration is invalid", () => {
  expectInvalid("let x : U8 = read<U16>(); x");
});
test("bare numeric literal with type suffix is invalid", () => {
  expectInvalid("256U8");
  expectInvalid("65536U16");
  expectInvalid("-1U16");
  expectInvalid("128I8");
});

test("negative value with unsigned type suffix is invalid", () => {
  expectInvalid("-1U8");
});

test("invalid source throws error", () => {
  expectInvalid("invalid");
});
