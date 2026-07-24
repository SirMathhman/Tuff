import { test, expect } from "bun:test";
import { compileTuffToTS } from "../../main/ts/compile";

const transpiler = new Bun.Transpiler({});

function expectValid(source: string, args: string[], expectedExitCode: number) {
  const compiled = compileTuffToTS(source);
  if (!compiled.isOk) {
    expect(compiled.error).toBeUndefined();
    return;
  }

  const tsCode = compiled.value;

  let rawJS: string;
  try {
    rawJS = transpiler.transformSync(tsCode);
  } catch (e) {
    expect(
      "Failed to transpile TS code: '" + tsCode + "'. Cause: " + e,
    ).toBeUndefined();
    return;
  }

  const wrappedJS =
    "let __ret__ = 0;let process = { exit(code) { __ret__ = code; } }; " +
    rawJS +
    "return __ret__;";
  try {
    const actualExitCode = new Function("__args__", wrappedJS)(args);
    if (expectedExitCode === actualExitCode) {
      expect(
        "Expected '" +
          expectedExitCode +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: " +
          tsCode,
      );
      return;
    }
  } catch (e) {
    expect(
      "Failed to execute transpiled JS. Generated: '" +
        wrappedJS +
        "'. Cause: " +
        e,
    ).toBeUndefined();
  }
}

function expectInvalid(source: string) {
  const generated = compileTuffToTS(source);
  if (generated.isOk) {
    expect(
      "Expected compiler to invalidate but generated unexpected: '" +
        generated.value +
        "'",
    ).toBeUndefined();
  }
}

test("An empty program", () => {
  expectValid("", [], 0);
});

test("An invalid program", () => {
  expectInvalid("~");
});

test("A single numeric literal", () => {
  expectValid("42", [], 42);
});

test("Zero literal", () => {
  expectValid("0", [], 0);
});

test("Large integer literal", () => {
  expectValid("999999", [], 999999);
});

test("Numeric literal with whitespace", () => {
  expectValid("  42  ", [], 42);
});

test("Non-numeric text is invalid", () => {
  expectInvalid("hello");
});
