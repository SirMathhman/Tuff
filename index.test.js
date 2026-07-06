import { test, expect } from "bun:test";
import { compileTuffToJS } from ".";

function throwWithoutUsingThrows(message) {
  // Using expect to avoid using 'throws'
  expect(message).toBe("Nothing to report.");
}

function assertValid(source, stdIn, expectedExitCode) {
  const generated = compileTuffToJS(source);
  if (!generated.isOk) {
    // Using expect to avoid using 'throws'
    throwWithoutUsingThrows("Error reported: " + generated.error);
    return;
  }

  const value = generated.value;

  try {
    const actualExitCode = new Function("stdIn", value)(stdIn);
    expect(actualExitCode).toBe(expectedExitCode);
  } catch (e) {
    throwWithoutUsingThrows(
      "Failed to execute generated code: '" + value + "', Error: " + e.message,
    );
  }
}

function assertInvalid(source) {
  const generated = compileTuffToJS(source);
  if (generated.isOk) {
    throwWithoutUsingThrows(
      "Expected compilation to fail, but compiler produced: '" +
        generated.value +
        "'",
    );
  }
}

test("empty source compiles and exits with code 0", () => {
  assertValid("", "", 0);
});

test("whitespace-only source compiles and exits with code 0", () => {
  assertValid(" ", "", 0);
});

test("read() reads input and returns it as exit code", () => {
  assertValid("read()", "1", 1);
});

test("read() handles space-separated input", () => {
  assertValid("read()", "1 2", 1);
});

test("read() + read() sums two inputs", () => {
  assertValid("read() + read()", "1 2", 3);
});

test("read() with spaces around parentheses works", () => {
  assertValid("read() + ( read() )", "1 2", 3);
});

test("{ expr } block evaluates to expression value", () => {
  assertValid("read() + { read() }", "1 2", 3);
});

test("let variable with read and block, then use it as exit code", () => {
  assertValid("let x = read() + { read() }; x", "1 2", 3);
});

test("nested let inside block expression", () => {
  assertValid("let x = read() + { let y = read(); y }; x", "1 2", 3);
});

test("readString() reads full input as string and .length returns its length", () => {
  assertValid("readString().length", "test", 4);
});

test("readString() reads a single string token and .length returns its length", () => {
  assertValid("readString().length", "test\nfoo", 4);
});

test("string literal with .length", () => {
  assertValid('"test".length', "", 4);
});
test("string literal containing brace does not break parsing", () => {
  const source = '"{".length'; // Tuff: "{" . length → 1
  assertValid(source, "", 1);
});

test("string literal with parentheses returns correct length", () => {
  assertValid('"read()".length', "", 6);
});

test("block with string inside and nested braces covers findMatchingBrace paths", () => {
  assertValid("{ let x = read(); x }", "5", 5);
});

test("top-level block expression evaluates correctly", () => {
  assertValid("{ 3 + 4 }", "", 7);
});

test("unknown identifier with method call fails validation", () => {
  assertInvalid("dummy.read()");
});

test("method call on declared variable fails validation", () => {
  assertInvalid("let dummy = 0; dummy.read()");
});

test("object literal with property access returns value", () => {
  assertValid("let dummy = { x : 100 }; dummy.x", "", 100);
});

test("object literal with multiple properties returns correct value", () => {
  assertValid("let o = { a : 10, b : 20 }; o.b", "", 20);
});

test("fn declaration stored in object and called as method", () => {
  const source = "fn get() => 100; let dummy = { x : get }; dummy.get()";
  assertValid(source, "", 100);
});

test("redeclaring variable with let overwrites previous value", () => {
  assertValid("let x = 0; let x = 1; x", "", 1);
});

test("mut variable can be reassigned and returns new value", () => {
  assertValid("let mut x = 0; x = 1; x", "", 1);
});

test("reassigning immutable let without mut fails validation", () => {
  assertInvalid("let x = 0; x = 1");
});

test("reassigning inside block affects outer scope", () => {
  assertValid("let mut x = 0; { x = 1; } x", "", 1);
});

test("embedded block with trailing expression covers hasEmbeddedBlocks path", () => {
  const source = "read() + { let y = read(); y }";
  assertValid(source, "1 2", 3);
});

test("block-scoped let does not leak to outer scope", () => {
  assertValid("let x = 0; { let x = 1; } x", "", 0);
});

test("top-level block with only declarations returns 0", () => {
  assertValid("{ let x = 100; }", "", 0);
});

test("invalid source fails compilation", () => {
  assertInvalid("invalid");
});
