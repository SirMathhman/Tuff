import { test, expect } from "@jest/globals";
import { compileTuffToJS } from "../src/lib.js";

function expectValid(source, stdIn, expectedExitCode) {
  const result = compileTuffToJS(source);
  if (result.variant === "err") throw new Error(result.error);
  const actualExitCode = new Function("stdIn", result.value)(stdIn);
  expect(expectedExitCode).toBe(actualExitCode);
}

function expectInvalid(source) {
  expect(compileTuffToJS(source).variant).toBe("err");
}

test("empty source compiles and exits with code 0", () => {
  expectValid("", "", 0);
});

test("read() returns parsed stdin as exit code", () => {
  expectValid("read()", "100", 100);
});

test("read() parses first token from multi-token stdin", () => {
  expectValid("read()", "100 20", 100);
});

test("multiple read() calls consume tokens sequentially, last value wins", () => {
  expectValid("read(); read()", "100 20", 20);
});

test("let variable assignment with expression return", () => {
  expectValid("let x = read(); x", "100 20", 100);
});

test("expression with two reads sums the values", () => {
  expectValid("read() + read()", "100 20", 120);
});

test("struct Empty {} compiles and exits with code 0", () => {
  expectValid("struct Empty {}", "", 0);
});

test("struct Empty<T> {} compiles and exits with code 0", () => {
  expectValid("struct Empty<T> {}", "", 0);
});

test("struct Wrapper<T> { field : T } compiles and exits with code 0", () => {
  expectValid("struct Wrapper<T> { field : T }", "", 0);
});

test("struct Two<T> { a : T, b : T } compiles and exits with code 0", () => {
  expectValid("struct Two<T> { a : T, b : T }", "", 0);
});

test("multiple struct declarations compile and exit with code 0", () => {
  expectValid("struct A {} struct B {}", "", 0);
});

test("type alias compiles and exits with code 0", () => {
  expectValid("type Temp = I32;", "", 0);
});

test("unknown identifier is rejected", () => {
  expectInvalid("foo");
});
