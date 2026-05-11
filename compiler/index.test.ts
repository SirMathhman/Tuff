import { test, expect } from "bun:test";
import { compileTuffToTS } from "./index";
import ts from "typescript";

function assertValid(
  tuffSourceCode: string,
  expectedExitCode: number,
  stdIn = "",
) {
  const compiledTS = compileTuffToTS(tuffSourceCode);
  const compiledJS = ts.transpile(compiledTS, {
    module: ts.ModuleKind.CommonJS,
  });
  const actualExitCode = new Function("stdIn", compiledJS)(stdIn);
  expect(actualExitCode).toBe(expectedExitCode);
}

function assertInvalid(tuffSourceCode: string) {
  expect(() => compileTuffToTS(tuffSourceCode)).toThrow();
}

test("The simplest possible program", () => {
  assertValid(``, 0);
});

test("A program with a syntax error", () => {
  assertInvalid(`this is not valid tuff code`);
});

test("read<U8>() parses stdin as unsigned 8-bit integer", () => {
  assertValid("read<U8>()", 100, "100");
});

test("read<U8>() ignores extra tokens in stdin", () => {
  assertValid("read<U8>()", 100, "100 20");
});
test("read<U8>() + read<U8>() sums two values from stdin", () => {
  assertValid("read<U8>() + read<U8>()", 3, "1 2");
});

test("read<U8>() + read<U8>() + read<U8>() chains three reads", () => {
  assertValid("read<U8>() + read<U8>() + read<U8>()", 6, "1 2 3");
});

test("let x : U8 = read<U8>(); x returns the variable value", () => {
  assertValid("let x : U8 = read<U8>(); x", 1, "1");
});
test("let x : U8 = read<U8>(); x + x doubles the variable value", () => {
  assertValid("let x : U8 = read<U8>(); x + x", 2, "1 3");
});

test("let x : U8 = read<U8>(); x + 1U8 adds a literal to the variable", () => {
  assertValid("let x : U8 = read<U8>(); x + 1U8", 2, "1");
});

