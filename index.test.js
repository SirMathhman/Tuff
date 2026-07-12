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

test("array literal with index access returns element", () => {
  expectValid("let array = [1]; array[0]", "", 1);
});

test("typed array annotation strips correctly and allows index access", () => {
  expectValid("let array : [I32; 1] = [1]; array[0]", "", 1);
});

test("function declaration and call", () => {
  expectValid("fn get() => read(); get()", "1", 1);
});

test("function with typed parameters passes arguments correctly", () => {
  expectValid(
    "fn add(first : I32, second : I32) => first + second; add(3, 4)",
    "",
    7,
  );
});

test("U8 literal returns value without suffix", () => {
  expectValid("100U8", "", 100);
});

test("typed variable with generic read call", () => {
  expectValid("let x : U8 = read<U8>(); x", "100", 100);
});

test("type alias resolves in declarations and literals", () => {
  expectValid("type Temp = I32; let foo : Temp = 100I32; foo", "", 100);
});

test("generic type alias with parameter substitution", () => {
  expectValid("type Temp<T> = T; let foo : Temp<I32> = 100I32; foo", "", 100);
});

test("nested generic type alias resolves recursively", () => {
  expectValid(
    "type Temp<T> = T; let foo : Temp<Temp<I32>> = 100I32; foo",
    "",
    100,
  );
});

test("wider read type assigned to wider var is OK", () => {
  expectValid("let x : U16 = read<U8>(); x", "100", 100);
});

test("narrower var cannot hold wider read type", () => {
  expectInvalid("let x : U8 = read<U16>(); x");
});

test("256U8 exceeds U8 range and throws error", () => {
  expectInvalid("256U8");
});

test("-1U8 is negative and out of unsigned range", () => {
  expectInvalid("-1U8");
});

test("invalid source throws error", () => {
  expectInvalid("invalid");
});
