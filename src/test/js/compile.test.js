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

test("object literal with property access", () => {
  expectValid("let obj = { field : 100 }; obj.field", [], 100);
});

test("object literal with multiple fields", () => {
  expectValid("let obj = { a : 1, b : 2, c : 3 }; obj.b", [], 2);
});

test("string literal length", () => {
  expectValid('let s = "hello"; s.length', [], 5);
});

test("string literal with escape sequences", () => {
  expectValid('let s = "a\\nb\\tc"; s.length', [], 5);
});

test("string literal with escaped quote", () => {
  expectValid('let s = "he said \\"hi\\""; s.length', [], 12);
});

test("string literal in object literal", () => {
  expectValid('let obj = { name : "test" }; obj.name.length', [], 4);
});

test("empty string literal", () => {
  expectValid('let s = ""; s.length', [], 0);
});

test("simple function definition and call", () => {
  expectValid("fn double(x) => x * 2; double(5)", [], 10);
});

test("function with no parameters", () => {
  expectValid("fn getTen() => 10; getTen()", [], 10);
});

test("function with multiple parameters", () => {
  expectValid("fn add(a, b) => a + b; add(3, 7)", [], 10);
});

test("function call in let declaration", () => {
  expectValid("fn square(x) => x * x; let result = square(4); result", [], 16);
});

test("function using __args__", () => {
  expectValid("fn argLen(args) => args.length; argLen(__args__)", [], 2);
});
